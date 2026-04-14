/**
 * src/navigation/AppNavigator.tsx
 *
 * Root navigator with auth guard.
 *
 *   Not authenticated → AuthStack (Login / SignUp / OTPVerify / ForgotPassword)
 *   Authenticated     → MainTabs  (Home / Threats / Privacy / Chatbot / Profile)
 *
 * Deep link scheme: cybot://
 *   cybot://auth/callback       — email link fallback (handled in useDeepLink)
 *   cybot://auth/reset-password — password reset redirect
 */

import React from 'react';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import * as Linking from 'expo-linking';

import { useAuthContext } from '@/contexts/AuthContext';
import { useDeepLink }   from '@/hooks/useDeepLink';

// ─── Auth screens ──────────────────────────────────────────────────────────────
import LoginScreen          from '@/screens/auth/LoginScreen';
import SignUpScreen         from '@/screens/auth/SignUpScreen';
import OTPVerifyScreen      from '@/screens/auth/OTPVerifyScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';

// ─── Main screens ──────────────────────────────────────────────────────────────
import HomeScreen         from '@/screens/HomeScreen';
import CyberNewsScreen    from '@/screens/CyberNewsScreen';
import PrivacyAuditScreen from '@/screens/PrivacyAuditScreen';
import ChatbotScreen      from '@/screens/ChatbotScreen';
import ProfileScreen      from '@/screens/ProfileScreen';
import MLInsightScreen    from '@/screens/MLInsightScreen';

// ─── Param lists ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login:          undefined;
  SignUp:         undefined;
  OTPVerify:      { email: string };
  ForgotPassword: undefined;
};

export type HomeStackParamList = {
  Home:      undefined;
  MLInsight: undefined;
};

export type ThreatsStackParamList = {
  CyberNews: undefined;
};

export type MainTabsParamList = {
  HomeTab:    undefined;
  ThreatsTab: undefined;
  Privacy:    undefined;
  Chatbot:    undefined;
  Profile:    undefined;
};

// ─── Deep-link config ──────────────────────────────────────────────────────────

const prefix = Linking.createURL('/');

const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [prefix, 'cybot://'],
  config: {
    screens: {
      Login:          'auth/callback',
      ForgotPassword: 'auth/reset-password',
    },
  },
};

// ─── Navigators ────────────────────────────────────────────────────────────────

const AuthStack    = createNativeStackNavigator<AuthStackParamList>();
const HomeStack    = createNativeStackNavigator<HomeStackParamList>();
const ThreatsStack = createNativeStackNavigator<ThreatsStackParamList>();
const MainTabs     = createBottomTabNavigator<MainTabsParamList>();

const STACK_SCREEN_OPTIONS = {
  headerStyle:         { backgroundColor: '#0a0e1a' },
  headerTintColor:     '#00d4ff',
  headerTitleStyle:    { fontWeight: '700' as const },
  headerBackTitle:     '',
  headerShadowVisible: false,
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"          component={LoginScreen} />
      <AuthStack.Screen name="SignUp"         component={SignUpScreen} />
      <AuthStack.Screen name="OTPVerify"      component={OTPVerifyScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <HomeStack.Screen name="Home"      component={HomeScreen}      options={{ headerShown: false }} />
      <HomeStack.Screen name="MLInsight" component={MLInsightScreen} options={{ title: 'ML Threat Analysis' }} />
    </HomeStack.Navigator>
  );
}

function ThreatsNavigator() {
  return (
    <ThreatsStack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <ThreatsStack.Screen name="CyberNews" component={CyberNewsScreen} options={{ headerShown: false }} />
    </ThreatsStack.Navigator>
  );
}

const TAB_ICON: Record<string, string> = {
  HomeTab: '🏠', ThreatsTab: '📰', Privacy: '🔍', Chatbot: '🤖', Profile: '👤',
};

const TAB_LABEL: Record<string, string> = {
  HomeTab: 'Home', ThreatsTab: 'News', Privacy: 'Privacy', Chatbot: 'Cybot AI', Profile: 'Profile',
};

function MainNavigator() {
  return (
    <MainTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: '#0a0e1a', borderTopColor: '#1a2236', height: 60 },
        tabBarActiveTintColor:   '#00d4ff',
        tabBarInactiveTintColor: '#4a5568',
        tabBarLabelStyle: { fontSize: 11, marginBottom: 4 },
        tabBarLabel: TAB_LABEL[route.name] ?? route.name,
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 18, color }}>{TAB_ICON[route.name]}</Text>
        ),
      })}
    >
      <MainTabs.Screen name="HomeTab"    component={HomeNavigator}      />
      <MainTabs.Screen name="ThreatsTab" component={ThreatsNavigator}   />
      <MainTabs.Screen name="Privacy"    component={PrivacyAuditScreen} />
      <MainTabs.Screen name="Chatbot"    component={ChatbotScreen}      />
      <MainTabs.Screen name="Profile"    component={ProfileScreen}      />
    </MainTabs.Navigator>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────

export default function AppNavigator() {
  const { session, loading } = useAuthContext();

  useDeepLink();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00d4ff" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      {session ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, backgroundColor: '#0a0e1a', justifyContent: 'center', alignItems: 'center' },
});
