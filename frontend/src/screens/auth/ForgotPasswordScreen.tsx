/**
 * src/screens/auth/ForgotPasswordScreen.tsx
 *
 * 3-step password reset flow:
 *   Step 1 — Enter email → Supabase sends OTP via resetPasswordForEmail
 *   Step 2 — Enter 6-digit OTP → verifyEmailOTP (type: 'recovery')
 *   Step 3 — Enter new password + confirm → updatePassword
 */

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react-native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AppNavigator';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;
};

type Step = 1 | 2 | 3;

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { resetPassword, verifyEmailOTP, updatePassword } = useAuthContext();

  const [step, setStep]                       = useState<Step>(1);
  const [email, setEmail]                     = useState('');
  const [digits, setDigits]                   = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]                 = useState(false);
  const [cooldown, setCooldown]               = useState(0);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handleSendOTP() {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Missing field', 'Please enter your email address.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(trimmed);
      setCooldown(RESEND_COOLDOWN);
      setStep(2);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOTP() {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw new Error(friendlyAuthError(error.message));
      setCooldown(RESEND_COOLDOWN);
      Alert.alert('Code resent', `A new code was sent to ${email}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not resend code.');
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(text: string, index: number) {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== '')) {
      verifyOTP(next.join(''));
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function verifyOTP(token: string) {
    if (token.length !== OTP_LENGTH) return;
    setLoading(true);
    try {
      await verifyEmailOTP(email.trim(), token, 'recovery');
      setStep(3);
    } catch (err: any) {
      Alert.alert('Verification failed', err.message ?? 'Invalid or expired code.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing fields', 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      Alert.alert(
        'Password updated',
        'Your password has been reset. Please sign in with your new password.',
        [{ text: 'Sign In', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep((s) => (s - 1) as Step);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.backArrow} onPress={goBack}>
        <ChevronLeft size={18} color={CYAN} strokeWidth={2.5} />
        <Text style={styles.backArrowText}>Back</Text>
      </TouchableOpacity>

      {/* Step progress */}
      <View style={styles.stepRow}>
        {([1, 2, 3] as Step[]).map((s) => (
          <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
        ))}
      </View>

      {/* Step 1: Email */}
      {step === 1 && (
        <>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send a 6-digit code to reset your password.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="done"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={handleSendOTP}
          />

          {loading ? (
            <ActivityIndicator color={CYAN} style={styles.spinner} />
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOTP} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Send Code</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Step 2: OTP */}
      {step === 2 && (
        <>
          <Text style={styles.title}>Enter Code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          <View style={styles.digitRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[styles.digitBox, d ? styles.digitBoxFilled : null]}
                value={d}
                onChangeText={(t) => handleDigitChange(t, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
              />
            ))}
          </View>

          {loading ? (
            <ActivityIndicator color={CYAN} style={styles.spinner} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, digits.some((d) => !d) && styles.btnDisabled]}
              onPress={() => verifyOTP(digits.join(''))}
              disabled={digits.some((d) => !d)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Verify Code</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResendOTP}
            disabled={cooldown > 0 || loading}
          >
            <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* Step 3: New password */}
      {step === 3 && (
        <>
          <Text style={styles.title}>New Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password — at least 8 characters.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="next"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor="#555"
            secureTextEntry
            returnKeyType="done"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onSubmitEditing={handleResetPassword}
          />

          {loading ? (
            <ActivityIndicator color={CYAN} style={styles.spinner} />
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleResetPassword} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Reset Password</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  backArrow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  backArrowText: { color: CYAN, fontSize: 15, fontWeight: '600' },

  stepRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  stepDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1A1A2E',
  },
  stepDotActive: { backgroundColor: CYAN },

  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#5A5A7A',
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 28,
  },
  emailHighlight: { color: CYAN, fontWeight: '700' },

  input: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },

  digitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 36,
  },
  digitBox: {
    width: 50,
    height: 60,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  digitBoxFilled: {
    borderColor: CYAN,
    borderWidth: 2,
  },

  spinner: { marginVertical: 16 },
  primaryBtn: {
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  btnDisabled: { backgroundColor: '#12121E', borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)' },
  primaryBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },

  resendBtn: { alignItems: 'center', marginTop: 24 },
  resendText: { color: CYAN, fontSize: 14, fontWeight: '600' },
  resendDisabled: { color: '#3A3A5A' },
});
