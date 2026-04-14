/**
 * src/screens/BlockchainScreen.tsx
 *
 * Submit a SHA-256 hash for on-chain verification, and view the user's
 * blockchain record history with verified/pending status.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Clipboard,
} from 'react-native';
import { useBlockchainRecords, BlockchainRecord } from '@/hooks/useBlockchainRecords';
import { api } from '@/services/api';

const CHAIN_COLOR = '#7c3aed';

function shortHash(hash: string | null): string {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function BlockchainScreen() {
  const { records, loading, refreshing, error, refresh, loadMore, prepend } = useBlockchainRecords();

  const [hash,        setHash]        = useState('');
  const [description, setDescription] = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [formOpen,    setFormOpen]    = useState(false);

  async function handleSubmit() {
    const trimmed = hash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(trimmed)) {
      Alert.alert('Invalid hash', 'Enter a 64-character lowercase hex SHA-256 hash.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/blockchain/verify/', {
        data_hash:   trimmed,
        description: description.trim() || undefined,
      });
      prepend(data);
      setHash('');
      setDescription('');
      setFormOpen(false);
      Alert.alert(
        'Submitted',
        data.verified
          ? `Transaction: ${shortHash(data.tx_hash)}`
          : 'Hash recorded. On-chain submission queued.',
      );
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Submission failed';
      const status = err?.response?.status;
      if (status === 409) {
        Alert.alert('Already submitted', 'This hash was already recorded.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function renderRecord({ item }: { item: BlockchainRecord }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.statusPill, item.verified ? styles.pillVerified : styles.pillPending]}>
            <Text style={[styles.pillText, item.verified ? styles.pillTextVerified : styles.pillTextPending]}>
              {item.verified ? 'Verified' : 'Pending'}
            </Text>
          </View>
          <Text style={styles.chainLabel}>{item.chain.toUpperCase()}</Text>
        </View>

        {item.description ? (
          <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
        ) : null}

        <Text style={styles.hashRow}>
          <Text style={styles.hashLabel}>Data  </Text>
          <Text style={styles.hashValue}>{shortHash(item.data_hash)}</Text>
        </Text>
        {item.tx_hash ? (
          <Text style={styles.hashRow}>
            <Text style={styles.hashLabel}>Tx    </Text>
            <Text style={styles.hashValue}>{shortHash(item.tx_hash)}</Text>
          </Text>
        ) : null}

        <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.header}>Blockchain Verify</Text>
        <TouchableOpacity
          style={[styles.addBtn, formOpen && styles.addBtnActive]}
          onPress={() => setFormOpen((v) => !v)}
        >
          <Text style={[styles.addBtnText, formOpen && styles.addBtnTextActive]}>
            {formOpen ? '✕ Cancel' : '+ Submit Hash'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Submit form */}
      {formOpen && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="SHA-256 hash (64 hex chars)"
            placeholderTextColor="#4a5568"
            value={hash}
            onChangeText={setHash}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Description (optional)"
            placeholderTextColor="#4a5568"
            value={description}
            onChangeText={setDescription}
          />
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#0a0e1a" />
              : <Text style={styles.submitBtnText}>Submit to Polygon</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={renderRecord}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#00d4ff" />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No blockchain records yet.</Text>
              <Text style={styles.emptySubText}>Submit a data hash to get started.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading ? <ActivityIndicator color="#00d4ff" style={{ marginVertical: 20 }} /> : null
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0a0e1a', paddingTop: 60 },

  topRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  header:       { fontSize: 24, fontWeight: '800', color: '#00d4ff' },
  addBtn:       { borderWidth: 1, borderColor: '#00d4ff', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnActive: { backgroundColor: '#1a2236' },
  addBtnText:   { color: '#00d4ff', fontSize: 13, fontWeight: '700' },
  addBtnTextActive: { color: '#4a5568' },

  form:         { backgroundColor: '#131929', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#1a2236' },
  input:        { backgroundColor: '#0a0e1a', borderWidth: 1, borderColor: '#1a2236', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: '#e2e8f0', fontSize: 14 },
  submitBtn:    { backgroundColor: CHAIN_COLOR, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card:         { backgroundColor: '#131929', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1a2236' },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusPill:   { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  pillVerified: { backgroundColor: '#38a16920' },
  pillPending:  { backgroundColor: '#d69e2e20' },
  pillText:     { fontSize: 12, fontWeight: '700' },
  pillTextVerified: { color: '#38a169' },
  pillTextPending:  { color: '#d69e2e' },
  chainLabel:   { color: '#7c3aed', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  description:  { color: '#e2e8f0', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  hashRow:      { marginBottom: 4 },
  hashLabel:    { color: '#4a5568', fontSize: 12 },
  hashValue:    { color: '#718096', fontSize: 12, fontFamily: 'monospace' } as any,
  date:         { color: '#4a5568', fontSize: 11, marginTop: 8 },

  errorText:    { color: '#e53e3e', textAlign: 'center', margin: 16 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText:    { color: '#4a5568', fontSize: 16, fontWeight: '600' },
  emptySubText: { color: '#2d3748', fontSize: 13, marginTop: 6 },
});
