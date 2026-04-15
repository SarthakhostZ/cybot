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
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';
import {
  LayoutGrid, Newspaper, QrCode, Bot, User,
} from 'lucide-react-native';

const CYAN      = '#00E5FF';
const BG        = '#080810';
const TAB_BG    = '#0C0C18';
const INACTIVE  = '#3A3A5A';

import { useAuthContext } from '@/contexts/AuthContext';
import { useDeepLink }   from '@/hooks/useDeepLink';

// ─── Auth screens ──────────────────────────────────────────────────────────────
import LoginScreen          from '@/screens/auth/LoginScreen';
import SignUpScreen         from '@/screens/auth/SignUpScreen';
import OTPVerifyScreen      from '@/screens/auth/OTPVerifyScreen';
import ForgotPasswordScreen from '@/screens/auth/ForgotPasswordScreen';

// ─── Main screens ──────────────────────────────────────────────────────────────
import HomeScreen          from '@/screens/HomeScreen';
import CyberNewsScreen     from '@/screens/CyberNewsScreen';
import PrivacyAuditScreen  from '@/screens/PrivacyAuditScreen';
import ChatbotScreen       from '@/screens/ChatbotScreen';
import ProfileScreen       from '@/screens/ProfileScreen';
import MLInsightScreen     from '@/screens/MLInsightScreen';
import ScanHistoryScreen   from '@/screens/ScanHistoryScreen';
import SecurityTipsScreen  from '@/screens/SecurityTipsScreen';

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

export type ProfileStackParamList = {
  ProfileMain:   undefined;
  ScanHistory:   undefined;
  SecurityTips:  undefined;
};

export type MainTabsParamList = {
  HomeTab:    undefined;
  ThreatsTab: undefined;
  Privacy:    undefined;
  Chatbot:    { initialMessage?: string } | undefined;
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
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MainTabs     = createBottomTabNavigator<MainTabsParamList>();

const STACK_SCREEN_OPTIONS = {
  headerStyle:         { backgroundColor: '#080810' },
  headerTintColor:     '#00E5FF',
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

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
      <ProfileStack.Screen name="ProfileMain"  component={ProfileScreen}      options={{ headerShown: false }} />
      <ProfileStack.Screen name="ScanHistory"  component={ScanHistoryScreen}  options={{ headerShown: false }} />
      <ProfileStack.Screen name="SecurityTips" component={SecurityTipsScreen} options={{ headerShown: false }} />
    </ProfileStack.Navigator>
  );
}

// ─── Tab icon map ──────────────────────────────────────────────────────────────

type TabIconComponent = React.ComponentType<{ size: number; color: string; strokeWidth: number }>;

const TAB_ICONS: Record<string, TabIconComponent> = {
  HomeTab:    LayoutGrid,
  ThreatsTab: Newspaper,
  Privacy:    QrCode,
  Chatbot:    Bot,
  Profile:    User,
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const Icon = TAB_ICONS[name];
  if (!Icon) return null;

  if (focused) {
    return (
      <View style={tabStyles.activeBubble}>
        <Icon size={22} color={BG} strokeWidth={2.5} />
      </View>
    );
  }

  return <Icon size={22} color={INACTIVE} strokeWidth={1.75} />;
}

function MainNavigator() {
  return (
    <MainTabs.Navigator
      screenOptions={({ route }) => ({
        headerShown:             false,
        tabBarShowLabel:         false,
        tabBarStyle:             tabStyles.bar,
        tabBarActiveTintColor:   CYAN,
        tabBarInactiveTintColor: INACTIVE,
        tabBarItemStyle:         tabStyles.item,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}
    >
      <MainTabs.Screen name="HomeTab"    component={HomeNavigator}      />
      <MainTabs.Screen name="ThreatsTab" component={ThreatsNavigator}   />
      <MainTabs.Screen name="Privacy"    component={PrivacyAuditScreen} />
      <MainTabs.Screen name="Chatbot"    component={ChatbotScreen}      />
      <MainTabs.Screen name="Profile"    component={ProfileNavigator}   />
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
        <ActivityIndicator size="large" color={CYAN} />
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
  loader: { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' },
});

const tabStyles = StyleSheet.create({
  bar: {
    backgroundColor:  TAB_BG,
    borderTopWidth:   1,
    borderTopColor:   'rgba(0,229,255,0.08)',
    height:           68,
    paddingBottom:    0,
    paddingTop:       0,
  },
  item: {
    justifyContent: 'center',
    alignItems:     'center',
    paddingVertical: 8,
  },
  activeBubble: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: CYAN,
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     CYAN,
    shadowOffset:    { width: 0, height: 0 },
    shadowOpacity:   0.5,
    shadowRadius:    14,
    elevation:       10,
  },
});
