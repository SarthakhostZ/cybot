/**
 * src/services/notifications.ts
 *
 * Expo push notification registration + Supabase token persistence.
 *
 * Usage:
 *   Call registerForPushNotifications() once after the user signs in.
 *   Call unregisterPushToken() on sign-out.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Push notifications don't work in Expo Go since SDK 53
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

// ─── Global notification handler (show banner even when app is foreground) ────
if (!IS_EXPO_GO) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  });
}

// ─── Android notification channel ─────────────────────────────────────────────
if (!IS_EXPO_GO && Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('threat-alerts', {
    name:               'Threat Alerts',
    importance:         Notifications.AndroidImportance.MAX,
    vibrationPattern:   [0, 250, 250, 250],
    lightColor:         '#00d4ff',
    sound:              'default',
    enableLights:       true,
    enableVibrate:      true,
    showBadge:          true,
  });
}

// ─── Register + persist token ─────────────────────────────────────────────────

/**
 * Request push-notification permission, obtain the Expo push token,
 * and upsert it in Supabase via the `upsert_push_token` RPC.
 *
 * Returns the token string, or null if permission was denied / not a device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications are not supported in Expo Go since SDK 53
  if (IS_EXPO_GO) {
    console.log('Push notifications are not supported in Expo Go. Use a development build.');
    return null;
  }

  // Push notifications only work on real devices
  if (!Device.isDevice) {
    console.log('Push notifications are not available in simulators.');
    return null;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied.');
    return null;
  }

  // Get Expo push token
  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    });
    token = result.data;
  } catch (err) {
    console.error('Failed to get Expo push token:', err);
    return null;
  }

  const platform: 'ios' | 'android' | 'web' =
    Platform.OS === 'ios' ? 'ios' :
    Platform.OS === 'android' ? 'android' : 'web';

  // Upsert in Supabase
  try {
    const { error } = await supabase.rpc('upsert_push_token', {
      p_token:    token,
      p_platform: platform,
    });
    if (error) console.error('Failed to save push token:', error.message);
  } catch (err) {
    console.error('upsert_push_token RPC error:', err);
  }

  return token;
}

/**
 * Remove a push token from Supabase (call on sign-out).
 */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await supabase.rpc('delete_push_token', { p_token: token });
  } catch (err) {
    console.error('delete_push_token RPC error:', err);
  }
}

/**
 * Add a listener for notifications received while the app is open.
 * Returns an unsubscribe function.
 */
export function onNotificationReceived(
  handler: (notification: Notifications.Notification) => void,
): () => void {
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Add a listener for when the user taps a notification.
 * Returns an unsubscribe function.
 */
export function onNotificationTapped(
  handler: (response: Notifications.NotificationResponse) => void,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}
