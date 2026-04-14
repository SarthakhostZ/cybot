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

const YELLOW = '#F5F000';

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
          <ActivityIndicator color={YELLOW} style={styles.spinner} />
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
  container: { flex: 1, backgroundColor: '#000' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 48,
    fontWeight: '900',
    color: YELLOW,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginBottom: 48,
    letterSpacing: 0.5,
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
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 24,
    marginTop: -4,
  },
  forgotText: { color: YELLOW, fontSize: 13, fontWeight: '600' },
  spinner: { marginVertical: 18 },
  primaryBtn: {
    backgroundColor: YELLOW,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
  link: {
    color: '#555',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAccent: { color: YELLOW, fontWeight: '700' },
});
