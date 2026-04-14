/**
 * src/hooks/useLinkGuard.ts
 *
 * Core scan orchestration hook.
 *
 * Flow:
 *  1. Receive URL → fast-scan (client-side, < 300ms)
 *  2. Whitelisted + safe  → show SafeScreen, auto-open after 1.5s
 *  3. Safe (not WL)       → show SafeScreen, auto-open after 3s,
 *                           fire background deep scan (no blocking)
 *  4. Suspicious          → deep scan → show WarningScreen or SafeScreen
 *  5. Dangerous           → show DangerScreen immediately,
 *                           fire backend call to log + get AI explanation
 *
 * STRICT RULE: NEVER auto-open a URL with verdict 'suspicious' or 'dangerous'.
 */

import { useCallback, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import NetInfo from '@react-native-community/netinfo';

import {
  fastScan,
  deepScan,
  getCachedScan,
  cacheScan,
  type FastScanResult,
  type DeepScanResult,
} from '@/services/linkguard';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScanStatus = 'idle' | 'fast-scanning' | 'deep-scanning' | 'complete' | 'error';
export type Verdict = 'safe' | 'suspicious' | 'dangerous';

export interface ScanState {
  status: ScanStatus;
  url: string;
  fastResult: FastScanResult | null;
  deepResult: DeepScanResult | null;
  finalVerdict: Verdict | null;
  error: string | null;
  isOffline: boolean;
  isPartialScan: boolean;  // true when backend timed out, client verdict used
}

const INITIAL_STATE: ScanState = {
  status: 'idle',
  url: '',
  fastResult: null,
  deepResult: null,
  finalVerdict: null,
  error: null,
  isOffline: false,
  isPartialScan: false,
};

const AUTO_OPEN_DELAY_WL = 1500;  // ms for whitelisted safe links
const AUTO_OPEN_DELAY    = 3000;  // ms for non-whitelisted safe links
const BACKEND_TIMEOUT    = 5000;  // ms before falling back to client verdict

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLinkGuard() {
  const [state, setState] = useState<ScanState>(INITIAL_STATE);
  const autoOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _update = useCallback((patch: Partial<ScanState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  /** Open URL in the device browser. Chrome first on Android, fallback to default. */
  const openInBrowser = useCallback(async (url: string) => {
    try {
      // expo-intent-launcher is optional; fall back gracefully
      const IntentLauncher = await import('expo-intent-launcher').catch(() => null);
      if (IntentLauncher) {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: url,
          packageName: 'com.android.chrome',
        });
        return;
      }
    } catch {
      // Chrome not installed or not Android — fall through
    }
    await Linking.openURL(url);
  }, []);

  /** Schedule auto-open for safe links only. */
  const _scheduleAutoOpen = useCallback(
    (url: string, delayMs: number) => {
      if (autoOpenTimer.current) clearTimeout(autoOpenTimer.current);
      autoOpenTimer.current = setTimeout(() => {
        openInBrowser(url);
      }, delayMs);
    },
    [openInBrowser],
  );

  /** Cancel a pending auto-open (e.g. user tapped "Go Back"). */
  const cancelAutoOpen = useCallback(() => {
    if (autoOpenTimer.current) {
      clearTimeout(autoOpenTimer.current);
      autoOpenTimer.current = null;
    }
  }, []);

  /** Reset hook state back to idle. */
  const reset = useCallback(() => {
    cancelAutoOpen();
    setState(INITIAL_STATE);
  }, [cancelAutoOpen]);

  /**
   * Main entry point. Call this whenever a URL needs to be scanned.
   * Non-HTTP schemes (tel:, mailto:, intent:) are passed through immediately.
   */
  const startScan = useCallback(
    async (url: string) => {
      if (!url) return;

      // Pass through non-HTTP schemes without scanning
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        await Linking.openURL(url);
        return;
      }

      cancelAutoOpen();
      _update({ ...INITIAL_STATE, status: 'fast-scanning', url });

      // ── Check connectivity ────────────────────────────────────────────────
      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected ?? false;

      // ── AsyncStorage cache check ──────────────────────────────────────────
      const cached = await getCachedScan(url);
      if (cached) {
        _update({
          status: 'complete',
          deepResult: cached,
          finalVerdict: cached.verdict as Verdict,
          fastResult: null,
          isPartialScan: false,
        });
        if (cached.verdict === 'safe') {
          _scheduleAutoOpen(url, AUTO_OPEN_DELAY);
        }
        return;
      }

      // ── Tier-1: fast (client-side) scan ──────────────────────────────────
      const fast = fastScan(url);
      _update({ fastResult: fast });

      // Whitelisted safe: show SafeScreen, auto-open after 1.5s
      if (fast.verdict === 'safe' && fast.whitelisted) {
        _update({
          status: 'complete',
          finalVerdict: 'safe',
          isOffline: !isOnline,
        });
        if (!fast.flags.includes('non_http_passthrough')) {
          _scheduleAutoOpen(url, AUTO_OPEN_DELAY_WL);
          // Fire background deep scan without blocking
          if (isOnline) {
            _backgroundDeepScan(url, fast).catch(() => null);
          }
        }
        return;
      }

      // Dangerous: show DangerScreen immediately, then log to backend
      if (fast.verdict === 'dangerous') {
        _update({
          status: 'complete',
          finalVerdict: 'dangerous',
          isOffline: !isOnline,
        });
        if (isOnline) {
          _backgroundDeepScan(url, fast).catch(() => null);
        }
        return;
      }

      // Safe (not whitelisted): show SafeScreen, auto-open after 3s, background scan
      if (fast.verdict === 'safe') {
        _update({
          status: 'complete',
          finalVerdict: 'safe',
          isOffline: !isOnline,
        });
        _scheduleAutoOpen(url, AUTO_OPEN_DELAY);
        if (isOnline) {
          _backgroundDeepScan(url, fast).catch(() => null);
        }
        return;
      }

      // Suspicious: perform blocking deep scan
      if (!isOnline) {
        _update({
          status: 'complete',
          finalVerdict: 'suspicious',
          isOffline: true,
          isPartialScan: true,
        });
        return;
      }

      _update({ status: 'deep-scanning' });
      await _blockingDeepScan(url, fast);
    },
    [_update, _scheduleAutoOpen, cancelAutoOpen],
  );

  /**
   * Deep scan that updates state and blocks the user on the scanning screen.
   * Used for suspicious URLs.
   */
  const _blockingDeepScan = useCallback(
    async (url: string, fast: FastScanResult) => {
      try {
        const deepPromise = deepScan(url, fast.score, fast.flags);
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), BACKEND_TIMEOUT),
        );

        const result = await Promise.race([deepPromise, timeoutPromise]);

        if (!result) {
          // Timeout: fall back to client verdict
          _update({
            status: 'complete',
            finalVerdict: fast.verdict as Verdict,
            isPartialScan: true,
          });
          return;
        }

        await cacheScan(url, result);
        _update({
          status: 'complete',
          deepResult: result,
          finalVerdict: result.verdict as Verdict,
          isPartialScan: false,
        });

        // If backend upgraded the verdict to safe, allow auto-open
        if (result.verdict === 'safe') {
          _scheduleAutoOpen(url, AUTO_OPEN_DELAY);
        }
      } catch {
        // Backend unreachable or timed out — use client verdict
        _update({
          status: 'complete',
          finalVerdict: fast.verdict as Verdict,
          isPartialScan: true,
        });
      }
    },
    [_update, _scheduleAutoOpen],
  );

  /**
   * Non-blocking deep scan (fire-and-forget).
   * Updates state silently in the background after initial result is shown.
   */
  const _backgroundDeepScan = useCallback(
    async (url: string, fast: FastScanResult) => {
      try {
        const result = await deepScan(url, fast.score, fast.flags);
        await cacheScan(url, result);
        // Silently update deep result for analytics / history
        _update({ deepResult: result });
      } catch {
        // Background — swallow errors
      }
    },
    [_update],
  );

  return {
    state,
    startScan,
    openInBrowser,
    cancelAutoOpen,
    reset,
  };
}
