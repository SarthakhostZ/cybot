/**
 * src/components/AvatarUploader.tsx
 *
 * Tappable avatar with upload progress overlay.
 * Compresses the picked image to fit within 50 KB before uploading.
 *
 * Props:
 *   userId     - Supabase user UUID
 *   currentUrl - existing avatar URL (or null)
 *   size       - diameter in px (default 96)
 *   onUploaded - called with the new public URL after upload
 */

import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Camera, Check } from 'lucide-react-native';
import { uploadAvatar, type UploadProgress } from '@/services/storage';

const MAX_BYTES = 50 * 1024; // 50 KB

interface Props {
  userId:     string;
  currentUrl: string | null;
  size?:      number;
  onUploaded: (url: string) => void;
}

/**
 * Compress image iteratively until it fits under MAX_BYTES.
 * Starts at quality 0.7, steps down to 0.5 then 0.3 then 0.15.
 * Also resizes to max 400×400 on the first pass.
 */
async function compressToLimit(uri: string): Promise<string> {
  const qualities = [0.7, 0.5, 0.3, 0.15];

  for (let i = 0; i < qualities.length; i++) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: qualities[i], format: ImageManipulator.SaveFormat.JPEG },
    );

    const info = await FileSystem.getInfoAsync(result.uri);
    const size = info.exists ? (info as any).size ?? 0 : 0;

    if (size <= MAX_BYTES || i === qualities.length - 1) {
      return result.uri;
    }
  }

  return uri; // fallback (shouldn't reach here)
}

export default function AvatarUploader({ userId, currentUrl, size = 96, onUploaded }: Props) {
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  async function pick() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your photo library to upload an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (result.canceled || !result.assets[0]) return;

    setProgress({ loaded: 0, total: 1, percent: 0 });

    try {
      const compressedUri = await compressToLimit(result.assets[0].uri);
      const url = await uploadAvatar(userId, compressedUri, setProgress);
      onUploaded(url);
      Alert.alert('Success', 'Profile photo updated successfully.');
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Unknown error');
    } finally {
      setProgress(null);
    }
  }

  const uploading = progress !== null;
  const percent   = progress?.percent ?? 0;

  return (
    <TouchableOpacity
      onPress={pick}
      activeOpacity={0.8}
      style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {currentUrl ? (
        <Image
          source={{ uri: currentUrl }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.initials, { fontSize: size * 0.38 }]}>?</Text>
        </View>
      )}

      {/* Progress overlay */}
      {uploading && (
        <View style={[styles.overlay, { borderRadius: size / 2 }]}>
          {percent < 100 ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.pct}>{percent}%</Text>
            </>
          ) : (
            <Check size={20} color="#00d4ff" strokeWidth={2.5} />
          )}
        </View>
      )}

      {/* Camera badge */}
      {!uploading && (
        <View style={styles.badge}>
          <Camera size={13} color="#0a0e1a" strokeWidth={2} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', position: 'relative' },
  avatar:    { resizeMode: 'cover' },
  placeholder: {
    backgroundColor: '#1a2236',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: { color: '#00d4ff', fontWeight: '700' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  pct:  { color: '#fff', fontSize: 12, fontWeight: '700' },
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#00d4ff',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
