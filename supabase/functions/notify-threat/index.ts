/**
 * supabase/functions/notify-threat/index.ts
 *
 * Deno Edge Function — triggered when a new CRITICAL or HIGH threat is created.
 *
 * Request body: { threat_id: string }
 *
 * Flow:
 *  1. Validate threat exists + severity warrants notification
 *  2. Fetch all registered Expo push tokens via get_all_push_tokens() RPC
 *  3. Batch-send to Expo Push API (max 100 per request)
 *  4. Store receipt IDs in notification_receipts for later polling
 *  5. Return summary { notified: N, batches: N, receipts: [...] }
 *
 * Deploy:   supabase functions deploy notify-threat
 * Secrets:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
 *           EXPO_ACCESS_TOKEN (optional but recommended for higher rate limits)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getAdmin }               from "../_shared/supabase.ts";
import { json, error, optionsResponse, CORS_HEADERS } from "../_shared/cors.ts";
import type { ThreatAlert, PushToken, ExpoMessage, ExpoTicket } from "../_shared/types.ts";

const EXPO_PUSH_URL   = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

/** Severity levels that trigger a push notification. */
const NOTIFY_SEVERITIES = new Set(["CRITICAL", "HIGH"]);

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return error("Method not allowed", 405);

  // ── Parse + validate body ─────────────────────────────────────────────────
  let threat_id: string;
  try {
    const body = await req.json();
    threat_id = body?.threat_id;
    if (!threat_id) throw new Error("threat_id is required");
  } catch (err) {
    return error((err as Error).message, 400);
  }

  const supabase = getAdmin();

  // ── Fetch threat ──────────────────────────────────────────────────────────
  const { data: threat, error: threatErr } = await supabase
    .from("threat_alerts")
    .select("id, title, description, severity, threat_type, ai_confidence")
    .eq("id", threat_id)
    .single<ThreatAlert>();

  if (threatErr || !threat) {
    return error("Threat not found", 404);
  }

  // Only notify for high-priority threats
  if (!NOTIFY_SEVERITIES.has(threat.severity)) {
    return json({
      skipped: true,
      reason: `Severity ${threat.severity} does not require push notification`,
    });
  }

  // ── Fetch all push tokens via RPC ─────────────────────────────────────────
  const { data: tokens, error: tokenErr } = await supabase
    .rpc("get_all_push_tokens") as { data: PushToken[] | null; error: unknown };

  if (tokenErr) {
    console.error("Failed to fetch push tokens:", tokenErr);
    return error("Failed to fetch push tokens", 500);
  }

  const validTokens = (tokens ?? []).filter((t) =>
    t.token.startsWith("ExponentPushToken[") || t.token.startsWith("ExpoPushToken[")
  );

  if (validTokens.length === 0) {
    return json({ notified: 0, batches: 0, message: "No registered push tokens" });
  }

  // ── Build Expo messages ───────────────────────────────────────────────────
  const confidence = Math.round((threat.ai_confidence ?? 0) * 100);
  const messages: ExpoMessage[] = validTokens.map((t) => ({
    to:       t.token,
    title:    `🚨 [${threat.severity}] ${threat.title}`,
    body:     `${threat.description.slice(0, 90)}… (AI confidence: ${confidence}%)`,
    sound:    "default",
    priority: threat.severity === "CRITICAL" ? "high" : "default",
    channelId: "threat-alerts",
    data: {
      threat_id:   threat.id,
      severity:    threat.severity,
      threat_type: threat.threat_type,
      screen:      "Threats",
    },
  }));

  // ── Send in batches of 100 ────────────────────────────────────────────────
  const batches: ExpoMessage[][] = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    batches.push(messages.slice(i, i + EXPO_BATCH_SIZE));
  }

  const allTickets: ExpoTicket[] = [];
  let failCount = 0;

  const expoHeaders: Record<string, string> = {
    "Content-Type":  "application/json",
    Accept:          "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoToken) expoHeaders["Authorization"] = `Bearer ${expoToken}`;

  for (const batch of batches) {
    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method:  "POST",
        headers: expoHeaders,
        body:    JSON.stringify(batch),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        console.error(`Expo batch failed (${resp.status}):`, txt);
        failCount += batch.length;
        continue;
      }

      const result = await resp.json();
      const tickets: ExpoTicket[] = result?.data ?? [];
      allTickets.push(...tickets);

      // Log any token-level errors
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "error") {
          console.warn(
            `Push failed for token ${batch[idx]?.to}: ${ticket.message}`
          );
          failCount++;
        }
      });
    } catch (err) {
      console.error("Batch send threw:", err);
      failCount += batch.length;
    }
  }

  // ── Persist receipt IDs for later polling (best-effort) ───────────────────
  const receiptIds = allTickets
    .filter((t) => t.status === "ok" && t.id)
    .map((t) => t.id!);

  if (receiptIds.length > 0) {
    // Store in a simple log table if it exists; silently skip if not
    try {
      await supabase.from("notification_receipts").insert(
        receiptIds.map((id) => ({ receipt_id: id, threat_id }))
      );
    } catch {
      // Non-fatal: receipts table is optional
    }
  }

  const notified = validTokens.length - failCount;
  console.log(
    `notify-threat: threat=${threat_id} tokens=${validTokens.length} ` +
    `notified=${notified} failed=${failCount} batches=${batches.length}`
  );

  return json({
    threat_id,
    notified,
    failed:   failCount,
    batches:  batches.length,
    receipts: receiptIds.slice(0, 10), // return first 10 for debugging
  });
});
