/**
 * src/screens/auth/OTPVerifyScreen.tsx
 *
 * 6-digit email OTP verification for signup confirmation.
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
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '@/navigation/AppNavigator';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/utils/authErrors';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'OTPVerify'>;
  route: RouteProp<AuthStackParamList, 'OTPVerify'>;
};

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;
const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

export default function OTPVerifyScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const { verifyEmailOTP } = useAuthContext();

  const [digits, setDigits]     = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading]   = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((n) => n - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function handleDigitChange(text: string, index: number) {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== '')) {
      verify(next.join(''));
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function verify(token: string) {
    if (token.length !== OTP_LENGTH) return;
    setLoading(true);
    try {
      await verifyEmailOTP(email, token, 'signup');
    } catch (err: any) {
      Alert.alert('Verification failed', err.message ?? 'Invalid or expired code.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw new Error(friendlyAuthError(error.message));
      setCooldown(RESEND_COOLDOWN);
      Alert.alert('Code resent', `A new verification code was sent to ${email}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not resend code. Please try again.');
    }
  }

  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.backArrow} onPress={() => navigation.goBack()}>
        <ChevronLeft size={18} color={CYAN} strokeWidth={2.5} />
        <Text style={styles.backArrowText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Check your email</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to{'\n'}
        <Text style={styles.emailText}>{maskedEmail}</Text>
      </Text>
      <Text style={styles.hint}>Enter the code below to verify your account.</Text>

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
          style={[styles.verifyBtn, digits.some((d) => !d) && styles.verifyBtnDisabled]}
          onPress={() => verify(digits.join(''))}
          disabled={digits.some((d) => !d)}
          activeOpacity={0.85}
        >
          <Text style={styles.verifyBtnText}>Verify</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.resendBtn}
        onPress={handleResend}
        disabled={cooldown > 0}
      >
        <Text style={[styles.resendText, cooldown > 0 && styles.resendDisabled]}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Text>
      </TouchableOpacity>
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
  backArrow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 40 },
  backArrowText: { color: CYAN, fontSize: 15, fontWeight: '600' },

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
    marginBottom: 4,
    textAlign: 'center',
  },
  emailText: { color: CYAN, fontWeight: '700' },
  hint: {
    color: '#3A3A5A',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 40,
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
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },

  spinner: { marginVertical: 16 },
  verifyBtn: {
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
  verifyBtnDisabled: { backgroundColor: '#12121E', borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)' },
  verifyBtnText: { color: '#000', fontWeight: '900', fontSize: 16 },

  resendBtn: { alignItems: 'center', marginTop: 28 },
  resendText: { color: CYAN, fontSize: 14, fontWeight: '600' },
  resendDisabled: { color: '#3A3A5A' },
});
