/**
 * src/services/storage.ts
 *
 * Supabase Storage helpers — avatars, threat reports, ML models.
 *
 * Buckets:
 *   avatars        — public read, owner write, 5 MB, images only
 *   threat-reports — private, owner scoped, 50 MB, pdf/json/txt
 *   ml-models      — admin only, 500 MB
 */

import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';

// ─── Constants ───────────────────────────────────────────────────────────────

const AVATARS_BUCKET  = 'avatars';
const REPORTS_BUCKET  = 'threat-reports';

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png',  webp: 'image/webp',
  gif: 'image/gif',
};

const ALLOWED_REPORT_TYPES: Record<string, string> = {
  pdf:  'application/pdf',
  json: 'application/json',
  txt:  'text/plain',
};

const MAX_AVATAR_BYTES  = 5 * 1024 * 1024;   //  5 MB
const MAX_REPORT_BYTES  = 50 * 1024 * 1024;  // 50 MB

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface StoredReport {
  name: string;
  path: string;
  size: number | undefined;
  created_at: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function readFileAsBytes(localUri: string): Promise<Uint8Array> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function getFileSize(localUri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(localUri);
  return info.exists ? (info as any).size ?? 0 : 0;
}

function extOf(uri: string): string {
  return uri.split('.').pop()?.toLowerCase() ?? '';
}

// ─── Avatars ──────────────────────────────────────────────────────────────────

/**
 * Upload (or replace) a user avatar.
 * Returns the public CDN URL of the uploaded image.
 *
 * @param userId    - Supabase user UUID
 * @param localUri  - local file:// URI from ImagePicker
 * @param onProgress - optional progress callback
 */
export async function uploadAvatar(
  userId: string,
  localUri: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const ext = extOf(localUri);
  const mimeType = ALLOWED_IMAGE_TYPES[ext];
  if (!mimeType) {
    throw new Error(`Unsupported image type ".${ext}". Allowed: jpg, png, webp, gif`);
  }

  const size = await getFileSize(localUri);
  if (size > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar must be under 5 MB (got ${(size / 1024 / 1024).toFixed(1)} MB)`);
  }

  onProgress?.({ loaded: 0, total: size, percent: 0 });
  const bytes = await readFileAsBytes(localUri);
  onProgress?.({ loaded: size, total: size, percent: 50 });

  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (error) throw error;
  onProgress?.({ loaded: size, total: size, percent: 100 });

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);

  // Cache-bust so React Native img tag picks up the new version
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Delete a user's avatar from storage.
 */
export async function deleteAvatar(userId: string): Promise<void> {
  // Try all supported extensions
  const paths = ['jpg', 'jpeg', 'png', 'webp', 'gif'].map((ext) => `${userId}/avatar.${ext}`);
  await supabase.storage.from(AVATARS_BUCKET).remove(paths);
}

/**
 * Return the public avatar URL without fetching file info.
 * Returns null if no avatar is stored (the URL 404s).
 */
export function getAvatarPublicUrl(userId: string, ext = 'jpg'): string {
  const { data } = supabase.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(`${userId}/avatar.${ext}`);
  return data.publicUrl;
}

// ─── Threat Reports ───────────────────────────────────────────────────────────

/**
 * Upload a threat report file to the private threat-reports bucket.
 * Returns the storage path (not a public URL — use downloadReport to get one).
 *
 * @param userId    - Supabase user UUID
 * @param localUri  - local file URI
 * @param fileName  - original file name (used in the storage path)
 * @param onProgress - optional progress callback
 */
export async function uploadThreatReport(
  userId: string,
  localUri: string,
  fileName: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<string> {
  const ext = extOf(fileName);
  const mimeType = ALLOWED_REPORT_TYPES[ext];
  if (!mimeType) {
    throw new Error(`Unsupported report type ".${ext}". Allowed: pdf, json, txt`);
  }

  const size = await getFileSize(localUri);
  if (size > MAX_REPORT_BYTES) {
    throw new Error(`Report must be under 50 MB (got ${(size / 1024 / 1024).toFixed(1)} MB)`);
  }

  onProgress?.({ loaded: 0, total: size, percent: 0 });
  const bytes = await readFileAsBytes(localUri);
  onProgress?.({ loaded: size, total: size, percent: 50 });

  // Path: {userId}/{timestamp}_{sanitised-filename}
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${Date.now()}_${safe}`;

  const { error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });

  if (error) throw error;
  onProgress?.({ loaded: size, total: size, percent: 100 });

  return path;
}

/**
 * Generate a signed download URL for a private threat report.
 * Default expiry: 1 hour.
 */
export async function downloadReport(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * List all reports for a given user.
 */
export async function listUserReports(userId: string): Promise<StoredReport[]> {
  const { data, error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .list(userId, { sortBy: { column: 'created_at', order: 'desc' } });

  if (error) throw error;

  return (data ?? []).map((item) => ({
    name:       item.name,
    path:       `${userId}/${item.name}`,
    size:       item.metadata?.size,
    created_at: item.created_at ?? '',
  }));
}

/**
 * Delete a specific threat report.
 */
export async function deleteReport(path: string): Promise<void> {
  const { error } = await supabase.storage.from(REPORTS_BUCKET).remove([path]);
  if (error) throw error;
}
