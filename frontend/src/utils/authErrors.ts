/**
 * src/utils/authErrors.ts
 *
 * Maps Supabase Auth error messages to human-friendly strings.
 * Avoids leaking internal error details to the UI.
 */

const ERROR_MAP: Record<string, string> = {
  // ── Login ──────────────────────────────────────────────────────────────────
  'Invalid login credentials':
    'Incorrect email or password. Please try again.',
  'Email not confirmed':
    'Please verify your email before signing in. Check your inbox for the code.',

  // ── Signup ─────────────────────────────────────────────────────────────────
  'User already registered':
    'An account with this email already exists. Try signing in.',
  'Password should be at least 6 characters':
    'Password must be at least 8 characters.',
  'Signup requires a valid password':
    'Please enter a valid password.',

  // ── Email OTP (signup & recovery) ─────────────────────────────────────────
  'Token has expired or is invalid':
    'This code has expired or is invalid. Please request a new one.',
  'Otp expired':
    'The verification code has expired. Please request a new one.',
  'Invalid OTP':
    'Incorrect verification code. Please check and try again.',
  'otp_disabled':
    'Email OTP is not enabled. Please contact support.',

  // ── Password reset ────────────────────────────────────────────────────────
  'Password recovery requires a valid email':
    'Please enter a valid email address.',
  'New password should be different from the old password':
    'Your new password must be different from your current password.',
  'Auth session missing':
    'Session expired. Please restart the password reset process.',

  // ── Rate limiting ─────────────────────────────────────────────────────────
  'For security purposes, you can only request this after':
    'Too many requests. Please wait a moment before trying again.',
  'Email rate limit exceeded':
    'Too many emails sent. Please wait before requesting another.',
  'over_email_send_rate_limit':
    'Too many emails sent. Please wait a minute and try again.',

  // ── Network ───────────────────────────────────────────────────────────────
  'Failed to fetch':
    'Network error. Please check your connection and try again.',
  'NetworkError':
    'Network error. Please check your connection and try again.',
  'fetch failed':
    'Network error. Please check your connection and try again.',
};

/**
 * Returns a clean, user-facing error message.
 * Falls back to the raw message if no mapping exists,
 * or a generic message for very long errors (likely stack traces).
 */
export function friendlyAuthError(rawMessage: string): string {
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (rawMessage.toLowerCase().includes(key.toLowerCase())) return friendly;
  }
  if (rawMessage.length > 120) {
    return 'An unexpected error occurred. Please try again.';
  }
  return rawMessage;
}
