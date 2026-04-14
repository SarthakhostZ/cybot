/**
 * src/components/ReportCard.tsx
 *
 * Displays a stored threat report with filename, size, date,
 * and a Download button that generates a signed URL and opens it.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { downloadReport, deleteReport, type StoredReport } from '@/services/storage';

interface Props {
  report:     StoredReport;
  onDeleted?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const EXT_ICON: Record<string, string> = { pdf: '📄', json: '🗂️', txt: '📝' };

export default function ReportCard({ report, onDeleted }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting]       = useState(false);

  const ext   = report.name.split('.').pop()?.toLowerCase() ?? '';
  const icon  = EXT_ICON[ext] ?? '📎';
  const date  = report.created_at
    ? new Date(report.created_at).toLocaleDateString()
    : '—';

  async function handleDownload() {
    setDownloading(true);
    try {
      const url = await downloadReport(report.path);
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert('Download failed', err.message ?? 'Could not generate download link.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Delete report?',
      `"${report.name}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteReport(report.path);
              onDeleted?.();
            } catch (err: any) {
              Alert.alert('Delete failed', err.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.icon}>{icon}</Text>
        <View>
          <Text style={styles.name} numberOfLines={1}>{report.name}</Text>
          <Text style={styles.meta}>{formatBytes(report.size)} · {date}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity onPress={handleDownload} disabled={downloading} style={styles.btn}>
          {downloading
            ? <ActivityIndicator size="small" color="#00d4ff" />
            : <Text style={styles.btnText}>↓</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} disabled={deleting} style={[styles.btn, styles.deleteBtn]}>
          {deleting
            ? <ActivityIndicator size="small" color="#e53e3e" />
            : <Text style={[styles.btnText, styles.deleteBtnText]}>✕</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    backgroundColor: '#131929',
    borderRadius:   12,
    padding:        14,
    marginBottom:   10,
    borderWidth:    1,
    borderColor:    '#1a2236',
  },
  left:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  icon:    { fontSize: 26 },
  name:    { color: '#e2e8f0', fontSize: 14, fontWeight: '600', maxWidth: 200 },
  meta:    { color: '#4a5568', fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    width: 34, height: 34,
    backgroundColor: '#1a2236',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn:     { backgroundColor: 'rgba(229,62,62,0.12)' },
  btnText:       { color: '#00d4ff', fontSize: 16, fontWeight: '700' },
  deleteBtnText: { color: '#e53e3e' },
});
