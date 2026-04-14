/**
 * _shared/types.ts
 * Shared TypeScript types for Edge Functions.
 */

export interface ThreatAlert {
  id: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  threat_type: string;
  ai_confidence: number;
  is_active: boolean;
  detected_at: string;
  reported_by: string | null;
}

export interface PushToken {
  user_id: string;
  token: string;
  platform: "ios" | "android" | "web";
}

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

export interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface ScanTarget {
  user_id: string;
  email: string;
}
