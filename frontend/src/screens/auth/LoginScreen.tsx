/**
 * src/screens/auth/LoginScreen.tsx
 *
 * Email + password sign-in.
 * Links to ForgotPassword and SignUp screens.
 */

import React, { useState } from 'react';
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
  ScrollView,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/navigation/AppNavigator';
import { useAuthContext } from '@/contexts/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

export default function LoginScreen({ navigation }: Props) {
  const { signInWithEmail } = useAuthContext();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(trimmedEmail, password);
    } catch (err: any) {
      Alert.alert('Sign-in failed', err.message ?? 'An unexpected error occurred.');
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
        {/* Header */}
        <Text style={styles.logo}>CYBOT</Text>
        <Text style={styles.tagline}>Cybersecurity. Privacy. Ethics.</Text>

        {/* Inputs */}
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
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#555"
          secureTextEntry
          returnKeyType="done"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />

        {/* Forgot password */}
        <TouchableOpacity
          style={styles.forgotRow}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* Submit */}
        {loading ? (
          <ActivityIndicator color={CYAN} style={styles.spinner} />
        ) : (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>Sign In</Text>
          </TouchableOpacity>
        )}

        {/* Sign up link */}
        <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.link}>
            Don't have an account?{'  '}
            <Text style={styles.linkAccent}>Create one</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 36,
    fontWeight: '900',
    color: CYAN,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 8,
  },
  tagline: {
    fontSize: 12,
    color: '#5A5A7A',
    textAlign: 'center',
    marginBottom: 48,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
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
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 24,
    marginTop: -4,
  },
  forgotText: { color: CYAN, fontSize: 13, fontWeight: '600' },
  spinner: { marginVertical: 18 },
  primaryBtn: {
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  link: {
    color: '#5A5A7A',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAccent: { color: CYAN, fontWeight: '700' },
});
