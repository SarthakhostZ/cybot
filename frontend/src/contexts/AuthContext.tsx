/**
 * src/contexts/AuthContext.tsx
 *
 * Single source of truth for auth state.
 * Supports:
 *   signUp            — email + password (sends OTP confirmation email)
 *   signInWithEmail   — email + password login
 *   verifyEmailOTP    — verify 6-digit email OTP (signup or recovery)
 *   resetPassword     — send OTP to email for password reset
 *   updatePassword    — set new password after recovery OTP verified
 *   signOut
 *   refreshSession
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/utils/authErrors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  verifyEmailOTP: (email: string, token: string, type: 'signup' | 'recovery') => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  // ─── Session hydration + subscription ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale / expired refresh token — clear it so user sees login screen
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ─── Auto-refresh when app returns to foreground ────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // ─── Auth actions ───────────────────────────────────────────────────────────

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: name ? { data: { full_name: name } } : undefined,
    });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const verifyEmailOTP = useCallback(
    async (email: string, token: string, type: 'signup' | 'recovery') => {
      const { error } = await supabase.auth.verifyOtp({ email, token, type });
      if (error) throw new Error(friendlyAuthError(error.message));
    },
    []
  );

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(friendlyAuthError(error.message));
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw new Error(friendlyAuthError(error.message));
    setSession(data.session);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signUp,
      signInWithEmail,
      verifyEmailOTP,
      resetPassword,
      updatePassword,
      signOut,
      refreshSession,
    }),
    [session, loading, signUp, signInWithEmail, verifyEmailOTP, resetPassword, updatePassword, signOut, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Consumer hook ────────────────────────────────────────────────────────────

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>');
  return ctx;
}
