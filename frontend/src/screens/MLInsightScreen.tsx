/**
 * src/screens/MLInsightScreen.tsx
 *
 * Submit raw network feature values to the ThreatDetector ML model
 * and display the per-class probability breakdown.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useMLInsight, FeatureInput } from '@/hooks/useMLInsight';

const CYAN = '#00E5FF';
const BG   = '#080810';
const CARD = '#0F0F1A';

const THREAT_COLOR: Record<string, string> = {
  benign:            '#22c55e',
  dos_ddos:          '#dc2626',
  port_scan:         '#f59e0b',
  brute_force:       '#ef4444',
  data_exfiltration: '#a855f7',
};

const FIELD_LABELS: Array<{ key: keyof FeatureInput; label: string; unit: string }> = [
  { key: 'packet_rate',         label: 'Packet Rate',         unit: 'pps'   },
  { key: 'byte_rate',           label: 'Byte Rate',           unit: 'bps'   },
  { key: 'flow_duration',       label: 'Flow Duration',       unit: 's'     },
  { key: 'unique_ips',          label: 'Unique IPs',          unit: 'count' },
  { key: 'port_entropy',        label: 'Port Entropy',        unit: '0–8'   },
  { key: 'failed_auth_count',   label: 'Failed Auth Count',   unit: 'count' },
  { key: 'payload_entropy',     label: 'Payload Entropy',     unit: '0–8'   },
  { key: 'geo_anomaly_score',   label: 'Geo Anomaly Score',   unit: '0–1'   },
  { key: 'time_of_day_anomaly', label: 'Time-of-Day Anomaly', unit: '0–1'   },
  { key: 'protocol_deviation',  label: 'Protocol Deviation',  unit: '0–1'   },
];

export default function MLInsightScreen() {
  const { result, loading, error, predict, reset } = useMLInsight();
  const [fields,    setFields]    = useState<Record<string, string>>({});
  const [autoAlert, setAutoAlert] = useState(false);

  function setField(key: string, val: string) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  async function runPrediction() {
    const features: FeatureInput = {};
    for (const { key } of FIELD_LABELS) {
      const raw = fields[key];
      if (raw !== undefined && raw !== '') {
        (features as any)[key] = parseFloat(raw) || 0;
      }
    }
    await predict(features, autoAlert);
  }

  function handleReset() {
    setFields({});
    reset();
  }

  const topClass = result?.threat_class ?? '';
  const topColor = THREAT_COLOR[topClass] ?? '#555';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.header}>ML Threat Analysis</Text>
      <Text style={styles.subtitle}>
        Enter raw network metrics. Leave fields blank to default to 0.
      </Text>

      {/* Feature inputs */}
      {FIELD_LABELS.map(({ key, label, unit }) => (
        <View key={key} style={styles.field}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#333"
              value={fields[key] ?? ''}
              onChangeText={(v) => setField(key, v)}
            />
            <Text style={styles.unit}>{unit}</Text>
          </View>
        </View>
      ))}

      {/* Auto-alert toggle */}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Auto-create threat alert</Text>
          <Text style={styles.toggleSub}>Creates a HIGH/CRITICAL alert if threat detected</Text>
        </View>
        <Switch
          value={autoAlert}
          onValueChange={setAutoAlert}
          trackColor={{ false: '#222', true: CYAN }}
          thumbColor={autoAlert ? '#000' : '#555'}
        />
      </View>

      {/* Actions */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={runPrediction}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.btnText}>Analyse</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.7}>
          <Text style={styles.resetBtnText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Result */}
      {result && (
        <View style={styles.resultCard}>
          {/* Verdict */}
          <View style={[styles.verdictBanner, { backgroundColor: topColor + '1a' }]}>
            <Text style={[styles.verdictClass, { color: topColor }]}>
              {topClass.replace(/_/g, ' ').toUpperCase()}
            </Text>
            <Text style={[styles.verdictConf, { color: topColor }]}>
              {Math.round(result.confidence * 100)}% confidence
            </Text>
          </View>

          {!result.model_loaded && (
            <View style={styles.noModelWarn}>
              <AlertTriangle size={14} color="#f59e0b" strokeWidth={2} />
              <Text style={styles.noModelWarnText}>
                Model not loaded — predictions are placeholder values.
              </Text>
            </View>
          )}

          {result.alert_id && (
            <Text style={styles.alertCreated}>
              Alert created: {result.alert_id.slice(0, 8)}…
            </Text>
          )}

          {/* Probability bars */}
          <Text style={styles.probTitle}>CLASS PROBABILITIES</Text>
          {Object.entries(result.probabilities)
            .sort(([, a], [, b]) => b - a)
            .map(([cls, prob]) => (
              <View key={cls} style={styles.probRow}>
                <Text style={styles.probLabel}>{cls.replace(/_/g, ' ')}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width:           `${Math.round(prob * 100)}%` as any,
                        backgroundColor: THREAT_COLOR[cls] ?? '#555',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.probPct}>{Math.round(prob * 100)}%</Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 20, paddingTop: 24, paddingBottom: 40 },

  header:   { fontSize: 26, fontWeight: '900', color: '#fff', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { color: '#555', fontSize: 13, lineHeight: 18, marginBottom: 24 },

  field:      { marginBottom: 12 },
  fieldLabel: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input:      {
    flex: 1,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
  },
  unit: { color: '#444', fontSize: 11, fontWeight: '600', width: 44 },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.07)',
  },
  toggleLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  toggleSub:   { color: '#555', fontSize: 11, marginTop: 2 },

  btnRow:      { flexDirection: 'row', gap: 10, marginBottom: 16 },
  btn:         { flex: 1, backgroundColor: CYAN, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#000', fontWeight: '900', fontSize: 15 },
  resetBtn:    { borderWidth: 1, borderColor: 'rgba(0,229,255,0.1)', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center', backgroundColor: '#111' },
  resetBtnText:{ color: '#555', fontSize: 14, fontWeight: '700' },

  errorText: { color: '#ef4444', textAlign: 'center', marginBottom: 12 },

  resultCard:    { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  verdictBanner: { borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 16 },
  verdictClass:  { fontSize: 20, fontWeight: '900', letterSpacing: 1.5 },
  verdictConf:   { fontSize: 13, fontWeight: '700', marginTop: 4 },
  noModelWarn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  noModelWarnText: { color: '#f59e0b', fontSize: 12, flex: 1 },
  alertCreated:  { color: '#22c55e', fontSize: 12, textAlign: 'center', marginBottom: 14 },

  probTitle: { color: '#444', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 12 },
  probRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  probLabel: { color: '#666', fontSize: 12, width: 120 },
  barTrack:  { flex: 1, height: 6, backgroundColor: '#1A1A2E', borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  barFill:   { height: '100%', borderRadius: 3 },
  probPct:   { color: '#555', fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' },
});
