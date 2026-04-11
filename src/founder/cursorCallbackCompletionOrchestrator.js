/**
 * v13.74 — Wait for provider-signed callback only (no synthetic POST / no forced closure).
 */

import { resolveCursorAutomationCallbackUrl } from "./cursorCloudAdapter.js";
import { getRunById } from "./executionRunStore.js";
import { listCosRunEventsForRun } from "./runCosEvents.js";
import { detectNarrowLivePatchFromPayload } from "./livePatchPayload.js";

/** @type {{ sleepMs: ((ms: number) => Promise<void>) | null }} */
export const __callbackOrchestratorTestHooks = {
  sleepMs: null,
};

export function shouldRunCallbackCompletionOrchestrator(tool, action, payload, env = process.env) {
  if (String(tool || "") !== "cursor") return false;
  const flag = String(env.CURSOR_AUTOMATION_FORCE_CALLBACK_ON_PENDING || "").trim();
  if (flag === "0") return false;
  if (flag === "1") return true;
  if (String(action || "") !== "emit_patch") return false;
  const pl = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  return Boolean(detectNarrowLivePatchFromPayload(pl));
}

function assertCallbackUrlAllowlisted(url, env) {
  const expected = resolveCursorAutomationCallbackUrl(env);
  if (!expected) throw new Error("cursor_callback_url_unconfigured");
  let a;
  let b;
  try {
    a = new URL(url);
    b = new URL(expected);
  } catch {
    throw new Error("cursor_callback_url_unparseable");
  }
  if (a.origin !== b.origin || a.pathname !== b.pathname) {
    throw new Error("cursor_callback_url_not_allowlisted");
  }
}

async function naturalProviderClosureObserved(runId) {
  const rows = await listCosRunEventsForRun(String(runId), 500);
  for (const r of rows || []) {
    const et = String(r.event_type || "");
    const pl = r.payload && typeof r.payload === "object" ? r.payload : {};
    if (et === "cos_cursor_webhook_ingress_safe") {
      if (String(pl.correlation_outcome || "") !== "matched") continue;
      const src = String(pl.callback_source_kind || "").trim().toLowerCase();
      if (src === "synthetic_orchestrator") continue;
      if (src === "manual_probe") continue;
      return true;
    }
    if (et === "external_completed" || et === "external_failed") {
      if (String(pl.canonical_provider || "") !== "cursor") continue;
      const src = String(pl.cos_callback_closure_source || "").trim().toLowerCase();
      if (src === "synthetic_orchestrator") continue;
      if (src === "manual_probe") continue;
      return true;
    }
  }
  return false;
}

async function sleep(ms) {
  const fn = __callbackOrchestratorTestHooks.sleepMs;
  if (fn) return fn(ms);
  await new Promise((r) => setTimeout(r, ms));
}

export async function awaitOrForceCallbackCompletion(p) {
  const env = p.env || process.env;
  const runId = String(p.runId || "").trim();
  const threadKey = String(p.threadKey || "").trim();
  const requestId = String(p.requestId || "").trim();
  if (!runId || !threadKey || !requestId) {
    return { status: "skipped_missing_inputs" };
  }

  const url = resolveCursorAutomationCallbackUrl(env);
  const secret = String(env.CURSOR_WEBHOOK_SECRET || "").trim();
  if (!url || !secret) {
    return { status: "skipped_no_contract" };
  }
  try {
    assertCallbackUrlAllowlisted(url, env);
  } catch (e) {
    return { status: "skipped_url_not_allowlisted", error: String(e?.message || e).slice(0, 120) };
  }

  const timeoutSec = Number(String(env.CURSOR_AUTOMATION_FORCE_CALLBACK_TIMEOUT_SEC || "").trim());
  const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? Math.floor(timeoutSec * 1000) : 120_000;
  const pollMs = 400;

  if (await naturalProviderClosureObserved(runId)) {
    return { status: "provider_callback_matched", waited_ms: 0, attempts: 0, synthetic_posts: 0 };
  }

  let waited = 0;
  let attempts = 0;
  while (waited < timeoutMs) {
    attempts += 1;
    if (await naturalProviderClosureObserved(runId)) {
      return { status: "provider_callback_matched", waited_ms: waited, attempts, synthetic_posts: 0 };
    }
    const run = await getRunById(runId);
    const pid = p.packetId != null ? String(p.packetId).trim() : "";
    const psm = run?.packet_state_map && typeof run.packet_state_map === "object" ? run.packet_state_map : {};
    const st = pid ? String(psm[pid] || "") : "";
    if (pid && (st === "completed" || st === "failed" || st === "skipped")) {
      if (await naturalProviderClosureObserved(runId)) {
        return { status: "provider_callback_matched", waited_ms: waited, attempts, synthetic_posts: 0 };
      }
    }
    await sleep(pollMs);
    waited += pollMs;
  }

  return {
    status: "callback_timeout",
    waited_ms: waited,
    attempts,
    synthetic_posts: 0,
  };
}

export function __resetCallbackOrchestratorDedupeForTests() {}
