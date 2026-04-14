/**
 * src/services/linkguard.ts
 *
 * Client-side fast URL scanner. Runs entirely in-process in < 300ms,
 * before any network call is made. Acts as tier-1 triage only —
 * the backend is always authoritative for the final verdict.
 *
 * Also exposes the backend deep-scan API call and AsyncStorage caching.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FastScanResult {
  score: number;              // 0-100
  verdict: 'safe' | 'suspicious' | 'dangerous';
  flags: string[];            // reasons for score deductions
  timestamp: number;
  whitelisted: boolean;
}

export interface DeepScanResult {
  scan_id: string;
  final_score: number;
  verdict: 'safe' | 'suspicious' | 'dangerous';
  flags: string[];
  ai_analysis: {
    risk: string;
    confidence: number;
    reason: string;
  } | null;
  domain_age_days: number | null;
  ssl_valid: boolean | null;
  redirect_chain: string[];
  google_safe_browsing: { flagged: boolean; threats: string[] } | null;
  scanned_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'linkguard_cache_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const SUSPICIOUS_KEYWORDS = [
  'login', 'verify', 'bank', 'secure', 'update', 'account',
  'password', 'confirm', 'suspend', 'urgent', 'prize', 'winner',
];

const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'buff.ly',
  'short.io', 'rb.gy', 'cutt.ly', 'is.gd', 'v.gd', 'clck.ru',
]);

/** Top-100 domains considered safe — bypass scoring entirely. */
const WHITELIST = new Set([
  'google.com', 'youtube.com', 'github.com', 'stackoverflow.com',
  'wikipedia.org', 'amazon.com', 'microsoft.com', 'apple.com',
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'reddit.com', 'netflix.com', 'spotify.com', 'dropbox.com', 'notion.so',
  'slack.com', 'zoom.us', 'figma.com', 'vercel.app', 'netlify.app',
  'cloudflare.com', 'stripe.com', 'paypal.com', 'shopify.com', 'medium.com',
  'dev.to', 'hashnode.com', 'npmjs.com', 'pypi.org', 'docker.com',
  'kubernetes.io', 'reactjs.org', 'vuejs.org', 'angular.io', 'svelte.dev',
  'nextjs.org', 'expo.dev', 'supabase.com', 'firebase.google.com',
  'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com',
  'digitalocean.com', 'heroku.com', 'railway.app', 'render.com',
  'mongodb.com', 'postgresql.org', 'redis.io', 'openai.com', 'anthropic.com',
  'huggingface.co', 'kaggle.com', 'arxiv.org', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov',
  'nytimes.com', 'bbc.com', 'reuters.com', 'theguardian.com', 'wsj.com',
  'techcrunch.com', 'wired.com', 'arstechnica.com', 'theverge.com',
  'gov.uk', 'usa.gov', 'europa.eu', 'who.int', 'un.org',
]);

const DOUBLE_EXT_RE = /\.(pdf|doc|docx|xls|xlsx|zip|rar)\.(exe|bat|cmd|ps1|sh|vbs|js)$/i;
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
// Homoglyphs: mix of digits and letters that look alike (0/O, 1/l/I)
const HOMOGLYPH_RE = /[0OlI1]{2,}/;

// ─── Fast (client-side) scanner ───────────────────────────────────────────────

/**
 * Score a URL locally in < 300ms.
 * Non-HTTP schemes (tel:, mailto:, intent:) are passed through without scoring.
 */
export function fastScan(url: string): FastScanResult {
  const ts = Date.now();

  // Non-HTTP passthrough
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { score: 100, verdict: 'safe', flags: ['non_http_passthrough'], timestamp: ts, whitelisted: false };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { score: 0, verdict: 'dangerous', flags: ['invalid_url'], timestamp: ts, whitelisted: false };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // Whitelist bypass
  if (WHITELIST.has(hostname)) {
    return { score: 100, verdict: 'safe', flags: [], timestamp: ts, whitelisted: true };
  }

  let score = 100;
  const flags: string[] = [];
  const lowerUrl = url.toLowerCase();

  // No HTTPS
  if (parsed.protocol !== 'https:') {
    score -= 20;
    flags.push('no_https');
  }

  // URL length
  if (url.length > 150) {
    score -= 30; // -10 for >80 and -20 for >150
    flags.push(`excessive_url_length:${url.length}`);
  } else if (url.length > 80) {
    score -= 10;
    flags.push(`long_url:${url.length}`);
  }

  // IP-based URL
  if (IP_RE.test(hostname)) {
    score -= 40;
    flags.push('ip_based_url');
  }

  // Suspicious keywords (max 2 deductions, -15 each, cap -30)
  const hits = SUSPICIOUS_KEYWORDS.filter((kw) => lowerUrl.includes(kw));
  if (hits.length > 0) {
    const deduction = Math.min(hits.length * 15, 30);
    score -= deduction;
    hits.slice(0, 2).forEach((kw) => flags.push(`suspicious_keyword:${kw}`));
  }

  // Excessive subdomains (>3 labels beyond the TLD)
  const parts = hostname.split('.');
  if (parts.length > 4) {
    score -= 15;
    flags.push(`excessive_subdomains:${parts.length - 2}`);
  }

  // Known URL shortener
  if (URL_SHORTENERS.has(hostname)) {
    score -= 10;
    flags.push('url_shortener');
  }

  // Homoglyph characters in hostname
  if (HOMOGLYPH_RE.test(hostname)) {
    score -= 25;
    flags.push('homoglyph_characters');
  }

  // Double extension
  if (DOUBLE_EXT_RE.test(parsed.pathname)) {
    score -= 30;
    flags.push('double_extension');
  }

  // @ in URL (before host = credential stuffing indicator)
  if (parsed.username || parsed.password) {
    score -= 20;
    flags.push('at_symbol_in_url');
  }

  score = Math.max(0, score);

  let verdict: FastScanResult['verdict'];
  if (score > 80) verdict = 'safe';
  else if (score >= 50) verdict = 'suspicious';
  else verdict = 'dangerous';

  return { score, verdict, flags, timestamp: ts, whitelisted: false };
}

// ─── AsyncStorage cache ───────────────────────────────────────────────────────

export async function getCachedScan(url: string): Promise<DeepScanResult | null> {
  try {
    const key = CACHE_PREFIX + url;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { result, expiresAt } = JSON.parse(raw) as { result: DeepScanResult; expiresAt: number };
    if (Date.now() > expiresAt) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function cacheScan(url: string, result: DeepScanResult): Promise<void> {
  try {
    const key = CACHE_PREFIX + url;
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ result, expiresAt: Date.now() + CACHE_TTL_MS }),
    );
  } catch {
    // Non-fatal
  }
}

// ─── Backend deep scan ────────────────────────────────────────────────────────

/**
 * Call the Django backend for a full deep scan.
 * Throws on network error so callers can fall back to client-side verdict.
 */
export async function deepScan(
  url: string,
  clientScore: number,
  clientFlags: string[],
): Promise<DeepScanResult> {
  const response = await api.post<DeepScanResult>('/linkguard/scan/', {
    url,
    client_score: clientScore,
    client_flags: clientFlags,
  });
  return response.data;
}

/** Fetch the user's scan history (page defaults to 1). */
export async function fetchScanHistory(page = 1) {
  const response = await api.get('/linkguard/history/', { params: { page } });
  return response.data;
}

/** Fetch the user's aggregate scan statistics. */
export async function fetchScanStats() {
  const response = await api.get('/linkguard/stats/');
  return response.data;
}
