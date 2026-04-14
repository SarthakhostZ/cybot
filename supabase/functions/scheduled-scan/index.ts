/**
 * supabase/functions/scheduled-scan/index.ts
 *
 * Deno Edge Function — daily cron job (02:00 UTC).
 *
 * Flow:
 *  1. Call get_users_needing_scan(7) RPC → users not scanned in 7 days
 *  2. Batch-trigger Django privacy audit API (concurrency-limited to 5)
 *  3. Return summary { total, triggered, failed }
 *
 * Deploy:  supabase functions deploy scheduled-scan
 * Cron:    configured in config.toml  [functions.scheduled-scan] schedule = "0 2 * * *"
 * Secrets: DJANGO_API_URL, INTERNAL_SERVICE_KEY
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getAdmin }                     from "../_shared/supabase.ts";
import { json, error, optionsResponse } from "../_shared/cors.ts";
import type { ScanTarget }              from "../_shared/types.ts";

const DJANGO_API_URL  = Deno.env.get("DJANGO_API_URL")!;
const INTERNAL_KEY    = Deno.env.get("INTERNAL_SERVICE_KEY")!;
const CONCURRENCY     = 5;   // parallel Django calls
const RETRY_ATTEMPTS  = 2;

async function triggerScan(target: ScanTarget, attempt = 1): Promise<string> {
  try {
    const resp = await fetch(`${DJANGO_API_URL}/api/v1/privacy/audit/`, {
      method: "POST",
      headers: {
        "Content-Type":           "application/json",
        "X-Internal-Service-Key": INTERNAL_KEY,
        "X-User-Id":              target.user_id,
      },
      body: JSON.stringify({ email: target.email, user_id: target.user_id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (resp.ok) return "triggered";
    if (resp.status >= 500 && attempt < RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return triggerScan(target, attempt + 1);
    }
    return `http_${resp.status}`;
  } catch (err) {
    if (attempt < RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return triggerScan(target, attempt + 1);
    }
    return `error: ${(err as Error).message}`;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return optionsResponse();

  if (!DJANGO_API_URL || !INTERNAL_KEY) {
    console.error("Missing DJANGO_API_URL or INTERNAL_SERVICE_KEY secrets");
    return error("Server misconfiguration", 500);
  }

  const supabase = getAdmin();

  // ── Fetch users needing scan via RPC ─────────────────────────────────────
  const { data: targets, error: rpcErr } = await supabase
    .rpc("get_users_needing_scan", { p_days_threshold: 7 }) as {
      data: ScanTarget[] | null;
      error: unknown;
    };

  if (rpcErr) {
    console.error("get_users_needing_scan RPC failed:", rpcErr);
    return error("Failed to fetch scan targets", 500);
  }

  const users = targets ?? [];
  console.log(`scheduled-scan: ${users.length} users need scanning`);

  if (users.length === 0) {
    return json({ total: 0, triggered: 0, failed: 0, message: "All users are up to date" });
  }

  // ── Process in concurrency-limited batches ────────────────────────────────
  const results: { userId: string; status: string }[] = [];

  for (let i = 0; i < users.length; i += CONCURRENCY) {
    const batch = users.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((u) => triggerScan(u))
    );
    settled.forEach((r, idx) => {
      const status = r.status === "fulfilled" ? r.value : `rejected: ${r.reason}`;
      results.push({ userId: batch[idx].user_id, status });
    });
  }

  const triggered = results.filter((r) => r.status === "triggered").length;
  const failed    = results.length - triggered;

  console.log(`scheduled-scan: total=${users.length} triggered=${triggered} failed=${failed}`);

  return json({ total: users.length, triggered, failed, results });
});
