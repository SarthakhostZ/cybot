/**
 * src/services/api.ts
 *
 * Axios instance that automatically attaches the Supabase JWT to every
 * request sent to the Django backend.
 *
 * URL resolution order (first reachable wins):
 *   1. EXPO_PUBLIC_API_BASE_URL  — explicit override from .env
 *   2. localhost:8000            — iOS Simulator / web browser
 *   3. 10.0.2.2:8000            — Android Emulator host alias
 */

import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// ─── URL resolution ───────────────────────────────────────────────────────────

/**
 * Returns the best base URL for the current runtime environment.
 *
 * Priority:
 *   EXPO_PUBLIC_API_BASE_URL (set by start-dev.sh or manually in .env)
 *   → iOS simulator default (localhost)
 *   → Android emulator default (10.0.2.2 = host machine)
 */
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) return envUrl;

  // Fallback for bare `npx expo start` without a configured .env
  if (Platform.OS === 'android') {
    // Android emulator routes 10.0.2.2 → host machine's localhost
    return 'http://10.0.2.2:8000/api/v1';
  }
  return 'http://localhost:8000/api/v1';
}

const BASE_URL = resolveBaseUrl();

// ─── Axios instance ───────────────────────────────────────────────────────────

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── In-memory token cache to avoid calling getSession() on every request ──────
let _cachedToken: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  _cachedToken = session?.access_token ?? null;
});

// ── Attach Bearer token before every request ──────────────────────────────────
api.interceptors.request.use(async (config) => {
  // Use cached token first; only hit Supabase if cache is empty (cold start)
  if (!_cachedToken) {
    const { data: { session } } = await supabase.auth.getSession();
    _cachedToken = session?.access_token ?? null;
  }
  if (_cachedToken) {
    config.headers.Authorization = `Bearer ${_cachedToken}`;
  }
  return config;
});

// ── Handle 401 — only sign out on token-level errors ─────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const msg: string = error.response?.data?.error ?? '';
      const isTokenError =
        msg.includes('expired') ||
        msg.includes('Missing') ||
        msg.includes('Invalid token');
      if (isTokenError) {
        await supabase.auth.signOut();
      }
    }
    return Promise.reject(error);
  },
);

// ─── Health check helper ──────────────────────────────────────────────────────

/**
 * Ping the backend health endpoint.
 * Returns true if reachable, false otherwise (network error / timeout).
 * Use this to decide whether to show an "offline" warning in the UI.
 */
export async function checkBackendReachable(): Promise<boolean> {
  try {
    await axios.get(`${BASE_URL.replace('/api/v1', '')}/health/`, {
      timeout: 4_000,
    });
    return true;
  } catch {
    return false;
  }
}
