/**
 * src/hooks/useDeepLink.ts
 *
 * Handles incoming deep links for:
 *   cybot://auth/callback        — OAuth (Google) + magic link sign-in
 *   cybot://auth/reset-password  — password reset
 *
 * Supabase picks up the tokens in the URL fragment automatically when
 * detectSessionInUrl is true for web.  On React Native we must manually
 * exchange the access_token / refresh_token from the URL.
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

function extractParams(url: string): Record<string, string> {
  // URL fragment (#) is used for OAuth tokens, query string (?) for others
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  const query    = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const params: Record<string, string> = {};
  for (const part of [fragment, query]) {
    for (const pair of part.split('&')) {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  }
  return params;
}

async function handleDeepLink(url: string) {
  if (!url) return;

  const params = extractParams(url);

  // OAuth / magic link: exchange access + refresh tokens
  if (params.access_token && params.refresh_token) {
    await supabase.auth.setSession({
      access_token:  params.access_token,
      refresh_token: params.refresh_token,
    });
    return;
  }

  // Email OTP / magic link: exchange the OTP token
  if (params.token_hash && params.type) {
    await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type: params.type as any,
    });
  }
}

/**
 * Mount this hook once at the app root (inside AuthProvider).
 * It attaches a URL listener and handles any pending link on cold start.
 */
export function useDeepLink() {
  useEffect(() => {
    // Handle link that launched the app (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle links while app is running
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, []);
}
