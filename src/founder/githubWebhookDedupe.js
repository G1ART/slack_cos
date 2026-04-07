/**
 * GitHub X-GitHub-Delivery dedupe (Supabase | memory | file).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';
import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';

const memSeen = new Set();

/** @type {number} test-only: invocations with non-empty delivery id */
let __deliveryRecordCallCount = 0;

function deliveriesPath() {
  return path.join(cosRuntimeBaseDir(), 'github_webhook_deliveries.json');
}

function supabaseHostFromEnv() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  try {
    return new URL(url).host || '(empty_host)';
  } catch {
    return '(malformed_url)';
  }
}

/**
 * @param {unknown} err
 */
function postgrestErrorFields(err) {
  const e = err && typeof err === 'object' ? /** @type {any} */ (err) : {};
  return {
    error_name: 'PostgrestError',
    error_message: String(e.message || err || ''),
    code: e.code != null ? String(e.code) : null,
    hint: e.hint != null ? String(e.hint) : null,
    details: e.details != null ? String(e.details) : null,
  };
}

/**
 * @param {string} deliveryId
 * @returns {Promise<boolean>} true if newly recorded (should process)
 */
export async function tryRecordGithubDelivery(deliveryId) {
  const id = String(deliveryId || '').trim();
  if (!id) return true;
  __deliveryRecordCallCount += 1;

  const mode = getCosRunStoreMode();
  if (mode === 'memory') {
    if (memSeen.has(id)) return false;
    memSeen.add(id);
    return true;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) {
      console.info(
        JSON.stringify({
          event: 'cos_github_webhook_deliveries',
          outcome: 'skipped_insert',
          mode: 'supabase',
          target_url_host: supabaseHostFromEnv(),
          reason: 'supabase_client_null',
        }),
      );
      return true;
    }
    const { error } = await sb.from('cos_github_webhook_deliveries').insert({ delivery_id: id });
    if (error) {
      const c = String(error.code || '');
      if (c === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) return false;
      const pf = postgrestErrorFields(error);
      console.error(
        JSON.stringify({
          event: 'cos_github_webhook_deliveries',
          outcome: 'insert_error',
          mode: 'supabase',
          target_url_host: supabaseHostFromEnv(),
          response_status: null,
          ...pf,
          short_cause: { code: pf.code, hint: pf.hint },
        }),
      );
      return true;
    }
    return true;
  }

  try {
    const raw = await fs.readFile(deliveriesPath(), 'utf8');
    const arr = JSON.parse(raw);
    const set = new Set(Array.isArray(arr) ? arr : []);
    if (set.has(id)) return false;
    set.add(id);
    const out = [...set].slice(-2000);
    await fs.mkdir(path.dirname(deliveriesPath()), { recursive: true });
    await fs.writeFile(deliveriesPath(), JSON.stringify(out), 'utf8');
    return true;
  } catch {
    await fs.mkdir(path.dirname(deliveriesPath()), { recursive: true });
    await fs.writeFile(deliveriesPath(), JSON.stringify([id]), 'utf8');
    return true;
  }
}

export function __resetGithubDeliveryMemoryForTests() {
  memSeen.clear();
  __deliveryRecordCallCount = 0;
}

export function __getGithubDeliveryRecordCallCountForTests() {
  return __deliveryRecordCallCount;
}
