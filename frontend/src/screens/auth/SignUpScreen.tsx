/**
 * src/screens/auth/SignUpScreen.tsx
 *
 * Registration flow: Name → Email → Password → Confirm Password
 * Real-time password strength hints shown below the password field.
 * On success, Supabase sends an OTP to the user's email.
 */

import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AppNavigator';
import { useAuthContext } from '@/contexts/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;
};

const YELLOW = '#F5F000';

// ─── Password requirement rules ───────────────────────────────────────────────

const PASSWORD_RULES = [
  { key: 'length',    label: 'At least 8 characters',       test: (p: string) => p.length >= 8 },
  { key: 'upper',     label: '1 uppercase letter (A-Z)',     test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower',     label: '1 lowercase letter (a-z)',     test: (p: string) => /[a-z]/.test(p) },
  { key: 'special',   label: '1 special character (!@#…)',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function passwordValid(p: string) {
  return PASSWORD_RULES.every(r => r.test(p));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuthContext();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [pwTouched, setPwTouched] = useState(false);

  function validate(): string | null {
    if (!name.trim())                    return 'Please enter your name.';
    if (!email.trim())                   return 'Please enter your email.';
    if (!/\S+@\S+\.\S+/.test(email.trim())) return 'Enter a valid email address.';
    if (!passwordValid(password))        return 'Password does not meet all requirements.';
    if (password !== confirm)            return 'Passwords do not match.';
    return null;
  }

  async function handleSignUp() {
    const error = validate();
    if (error) {
      Alert.alert('Invalid input', error);
      return;
    }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
      navigation.navigate('OTPVerify', { email: email.trim() });
    } catch (err: any) {
      Alert.alert('Sign-up failed', err.message ?? 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join the Cybot security network</Text>

        {/* Name */}
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#555"
          autoCapitalize="words"
          returnKeyType="next"
          value={name}
          onChangeText={setName}
        />

        {/* Email */}
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
        />

        {/* Password */}
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          secureTextEntry
          returnKeyType="next"
          value={password}
          onChangeText={text => { setPassword(text); setPwTouched(true); }}
        />

        {/* Real-time password requirements */}
        {pwTouched && (
          <View style={styles.rulesBox}>
            {PASSWORD_RULES.map(rule => {
              const met = rule.test(password);
              return (
                <View key={rule.key} style={styles.ruleRow}>
                  <Text style={met ? styles.ruleIconOk : styles.ruleIconFail}>
                    {met ? '✓' : '✗'}
                  </Text>
                  <Text style={met ? styles.ruleLabelOk : styles.ruleLabelFail}>
                    {rule.label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Confirm Password */}
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#555"
          secureTextEntry
          returnKeyType="done"
          value={confirm}
          onChangeText={setConfirm}
          onSubmitEditing={handleSignUp}
        />

        {/* Confirm mismatch hint */}
        {confirm.length > 0 && confirm !== password && (
          <Text style={styles.mismatch}>Passwords do not match</Text>
        )}

        {loading ? (
          <ActivityIndicator color={YELLOW} style={styles.spinner} />
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSignUp} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Create Account</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.link}>
            Already have an account?{'  '}
            <Text style={styles.linkAccent}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  rulesBox: {
    backgroundColor: '#111',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: -4,
    marginBottom: 12,
    gap: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleIconOk:    { color: '#4CAF50', fontSize: 13, fontWeight: '700', width: 16 },
  ruleIconFail:  { color: '#FF5252', fontSize: 13, fontWeight: '700', width: 16 },
  ruleLabelOk:   { color: '#4CAF50', fontSize: 13 },
  ruleLabelFail: { color: '#888',    fontSize: 13 },
  mismatch: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
    paddingLeft: 4,
  },
  spinner: { marginVertical: 18 },
  primaryBtn: {
    backgroundColor: YELLOW,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  primaryBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  link: {
    color: '#555',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAccent: { color: YELLOW, fontWeight: '700' },
});
