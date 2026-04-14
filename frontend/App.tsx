/**
 * App.tsx — root entry point
 *
 * Wraps the app with:
 *   GestureHandlerRootView  (required by react-native-gesture-handler)
 *   AuthProvider            (Supabase auth state + actions)
 *   AppNavigator            (auth-guarded navigation)
 */

import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/contexts/AuthContext';
import AppNavigator from '@/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#0a0e1a" />
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
