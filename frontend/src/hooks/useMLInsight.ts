/**
 * src/hooks/useMLInsight.ts
 *
 * Calls POST /api/v1/ml/predict/ with a raw feature dict.
 * The backend normalises the values; callers submit raw network metrics.
 */

import { useState } from 'react';
import { api } from '@/services/api';

export interface PredictionResult {
  threat_class:  string;
  confidence:    number;
  probabilities: Record<string, number>;
  is_threat:     boolean;
  model_loaded:  boolean;
  alert_id?:     string;
}

export interface FeatureInput {
  packet_rate?:         number;
  byte_rate?:           number;
  flow_duration?:       number;
  unique_ips?:          number;
  port_entropy?:        number;
  failed_auth_count?:   number;
  payload_entropy?:     number;
  geo_anomaly_score?:   number;
  time_of_day_anomaly?: number;
  protocol_deviation?:  number;
}

interface State {
  result:    PredictionResult | null;
  loading:   boolean;
  error:     string | null;
}

export function useMLInsight() {
  const [state, setState] = useState<State>({ result: null, loading: false, error: null });

  async function predict(features: FeatureInput, autoAlert = false): Promise<PredictionResult | null> {
    setState({ result: null, loading: true, error: null });
    try {
      const { data } = await api.post('/ml/predict/', {
        features,
        auto_alert: autoAlert,
      });
      setState({ result: data, loading: false, error: null });
      return data;
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Prediction failed';
      setState({ result: null, loading: false, error: msg });
      return null;
    }
  }

  function reset() {
    setState({ result: null, loading: false, error: null });
  }

  return { ...state, predict, reset };
}
