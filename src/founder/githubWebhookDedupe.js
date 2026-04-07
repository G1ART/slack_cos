/**
 * GitHub X-GitHub-Delivery dedupe (Supabase | memory | file).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';
import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';

const memSeen = new Set();

function deliveriesPath() {
  return path.join(cosRuntimeBaseDir(), 'github_webhook_deliveries.json');
}

/**
 * @param {string} deliveryId
 * @returns {Promise<boolean>} true if newly recorded (should process)
 */
export async function tryRecordGithubDelivery(deliveryId) {
  const id = String(deliveryId || '').trim();
  if (!id) return true;

  const mode = getCosRunStoreMode();
  if (mode === 'memory') {
    if (memSeen.has(id)) return false;
    memSeen.add(id);
    return true;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return true;
    const { error } = await sb.from('cos_github_webhook_deliveries').insert({ delivery_id: id });
    if (error) {
      const c = String(error.code || '');
      if (c === '23505' || String(error.message || '').toLowerCase().includes('duplicate')) return false;
      console.error('[github_webhook_deliveries]', error.message);
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
}
