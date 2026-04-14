/**
 * supabase/functions/ml-inference/index.ts
 *
 * Deno Edge Function — webhook called by AWS Lambda after the ThreatDetector
 * ML model processes a feature vector.
 *
 * Request (from Lambda, authenticated with INTERNAL_SERVICE_KEY):
 * {
 *   features:     number[],       // 10-dim input vector
 *   threat_class: string,         // benign | dos_ddos | port_scan | brute_force | data_exfiltration
 *   confidence:   number,         // 0–1
 *   source:       string,         // source system identifier
 *   metadata?:    object          // optional raw context
 * }
 *
 * Actions:
 *  - confidence < 0.6  → log only, no alert
 *  - confidence >= 0.6 → insert threat_alert
 *  - confidence >= 0.8 → also invoke notify-threat for push notifications
 *
 * Deploy:  supabase functions deploy ml-inference
 * Secrets: INTERNAL_SERVICE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getAdmin }                     from "../_shared/supabase.ts";
import { json, error, optionsResponse } from "../_shared/cors.ts";

const INTERNAL_KEY     = Deno.env.get("INTERNAL_SERVICE_KEY")!;
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CONFIDENCE_CREATE_THRESHOLD = 0.60;
const CONFIDENCE_NOTIFY_THRESHOLD = 0.80;

// Map ML class names → human-readable threat types + severity rules
const CLASS_CONFIG: Record<string, { threat_type: string; severity_fn: (c: number) => string }> = {
  benign:           { threat_type: "benign",           severity_fn: () => "LOW" },
  dos_ddos:         { threat_type: "dos_ddos",         severity_fn: (c) => c >= 0.9 ? "CRITICAL" : "HIGH" },
  port_scan:        { threat_type: "port_scan",        severity_fn: (c) => c >= 0.85 ? "HIGH" : "MEDIUM" },
  brute_force:      { threat_type: "brute_force",      severity_fn: (c) => c >= 0.85 ? "HIGH" : "MEDIUM" },
  data_exfiltration:{ threat_type: "data_exfiltration",severity_fn: (c) => c >= 0.9 ? "CRITICAL" : "HIGH" },
};

const TITLES: Record<string, string> = {
  dos_ddos:          "Potential DDoS/DoS Attack Detected",
  port_scan:         "Port Scan Activity Detected",
  brute_force:       "Brute Force Attempt Detected",
  data_exfiltration: "Data Exfiltration Pattern Detected",
  benign:            "Benign Traffic Pattern",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return error("Method not allowed", 405);

  // ── Authenticate caller ───────────────────────────────────────────────────
  const callerKey = req.headers.get("X-Internal-Service-Key") ?? "";
  if (!callerKey || callerKey !== INTERNAL_KEY) {
    return error("Unauthorized", 401);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    features: number[];
    threat_class: string;
    confidence: number;
    source: string;
    metadata?: Record<string, unknown>;
  };

  try {
    body = await req.json();
    if (!body.threat_class || typeof body.confidence !== "number" || !body.source) {
      throw new Error("threat_class, confidence, and source are required");
    }
    if (body.confidence < 0 || body.confidence > 1) {
      throw new Error("confidence must be between 0 and 1");
    }
  } catch (err) {
    return error((err as Error).message, 400);
  }

  const { threat_class, confidence, source, metadata } = body;
  const cfg = CLASS_CONFIG[threat_class];

  console.log(`ml-inference: class=${threat_class} confidence=${confidence.toFixed(3)} source=${source}`);

  // ── Below threshold — log and skip ────────────────────────────────────────
  if (confidence < CONFIDENCE_CREATE_THRESHOLD || threat_class === "benign") {
    return json({
      action: "skipped",
      reason: threat_class === "benign"
        ? "Benign traffic"
        : `Confidence ${confidence.toFixed(3)} below threshold ${CONFIDENCE_CREATE_THRESHOLD}`,
    });
  }

  if (!cfg) {
    return error(`Unknown threat_class: ${threat_class}`, 400);
  }

  // ── Create threat_alert ───────────────────────────────────────────────────
  const severity = cfg.severity_fn(confidence);
  const supabase = getAdmin();

  const alertPayload = {
    title:        TITLES[threat_class] ?? `ML Detection: ${threat_class}`,
    description:
      `ML model detected ${threat_class.replace(/_/g, " ")} from source "${source}". ` +
      `Confidence: ${Math.round(confidence * 100)}%. ` +
      (metadata ? `Context: ${JSON.stringify(metadata).slice(0, 200)}` : ""),
    severity,
    threat_type:    cfg.threat_type,
    ai_confidence:  confidence,
    is_active:      true,
    reported_by:    null, // ML-detected, no user reporter
  };

  const { data: alert, error: insertErr } = await supabase
    .from("threat_alerts")
    .insert(alertPayload)
    .select("id, severity")
    .single();

  if (insertErr || !alert) {
    console.error("Failed to insert threat_alert:", insertErr);
    return error("Failed to create threat alert", 500);
  }

  console.log(`ml-inference: created alert ${alert.id} severity=${severity}`);

  // ── Notify if high confidence ─────────────────────────────────────────────
  let notifyResult: unknown = null;
  if (confidence >= CONFIDENCE_NOTIFY_THRESHOLD) {
    try {
      const notifyResp = await fetch(
        `${SUPABASE_URL}/functions/v1/notify-threat`,
        {
          method:  "POST",
          headers: {
            "Content-Type":    "application/json",
            "Authorization":   `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ threat_id: alert.id }),
        }
      );
      notifyResult = await notifyResp.json();
    } catch (err) {
      console.warn("notify-threat invocation failed:", err);
    }
  }

  return json({
    action:    "created",
    alert_id:  alert.id,
    severity,
    notified:  confidence >= CONFIDENCE_NOTIFY_THRESHOLD,
    notifyResult,
  });
});
