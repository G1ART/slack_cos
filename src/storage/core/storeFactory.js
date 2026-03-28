import { createJsonStoreAdapter } from './jsonStoreAdapter.js';
import { createSupabaseStoreAdapter } from './supabaseStoreAdapter.js';
import { formatSupabaseConnectivity, getSupabaseClientConfig } from './supabaseClient.js';
import { CORE_DUAL_WRITE_COLLECTIONS } from './types.js';
import { getRuntimeMode } from '../../runtime/env.js';
import { logStorageEvent } from './storageTelemetry.js';

function normalizeStorageMode(raw) {
  if (!raw) return 'json';
  const m = String(raw).toLowerCase().trim();
  if (m === 'json' || m === 'dual' || m === 'supabase') return m;
  return 'json';
}

function resolveStorageMode(explicit) {
  if (explicit != null && String(explicit).trim()) {
    return normalizeStorageMode(explicit);
  }
  if (getRuntimeMode() === 'hosted') return 'dual';
  return 'json';
}

function resolveReadPreference() {
  const v = process.env.STORE_READ_PREFERENCE;
  if (v != null && String(v).trim()) {
    const m = String(v).toLowerCase().trim();
    if (m === 'json' || m === 'supabase') return m;
  }
  if (getRuntimeMode() === 'hosted') return 'supabase';
  return 'json';
}

export function createStore({ storageMode } = {}) {
  const mode = resolveStorageMode(storageMode ?? process.env.STORAGE_MODE);
  const jsonAdapter = createJsonStoreAdapter();
  const supabaseAdapter = createSupabaseStoreAdapter();
  const supaCfg = getSupabaseClientConfig();
  const connectivityText = formatSupabaseConnectivity(supaCfg);
  const readPreference = resolveReadPreference();
  const coreSet = new Set(CORE_DUAL_WRITE_COLLECTIONS);
  const migratedCoreSet = new Set(CORE_DUAL_WRITE_COLLECTIONS);

  const writeJson = jsonAdapter;
  const writeSupabase = supaCfg.configured ? supabaseAdapter : null;

  function wantsSupabaseRead(name) {
    if (!writeSupabase) return false;
    if (!coreSet.has(name)) return false;
    if (mode === 'json') return false;
    if (mode === 'supabase') return migratedCoreSet.has(name);
    return readPreference === 'supabase';
  }

  function pickReadAdapter(name) {
    if (mode === 'json') return jsonAdapter;
    if (mode === 'supabase') {
      if (!writeSupabase || !migratedCoreSet.has(name)) return jsonAdapter;
      return supabaseAdapter;
    }
    if (wantsSupabaseRead(name)) return supabaseAdapter;
    return jsonAdapter;
  }

  function logMisconfiguredSupabaseRead(name) {
    if (
      (mode === 'dual' || mode === 'supabase') &&
      readPreference === 'supabase' &&
      coreSet.has(name) &&
      !writeSupabase
    ) {
      logStorageEvent('store_read_preference_unmet', {
        collection: name,
        reason: 'supabase_not_configured_json_only',
        read_preference: readPreference,
        storage_mode: mode,
      });
    }
  }

  async function readList(name, query) {
    logMisconfiguredSupabaseRead(name);
    const primary = pickReadAdapter(name);
    if (primary === jsonAdapter) {
      return jsonAdapter.list(name, query);
    }
    try {
      const rows = await supabaseAdapter.list(name, query);
      logStorageEvent('store_read_ok', { collection: name, source: 'supabase', op: 'list' });
      return rows;
    } catch (err) {
      logStorageEvent('store_read_fallback', {
        collection: name,
        source: 'json',
        op: 'list',
        error: String(err?.message || err),
      });
      const rows = await jsonAdapter.list(name, query);
      logStorageEvent('store_read_ok_after_fallback', { collection: name, source: 'json', op: 'list' });
      return rows;
    }
  }

  async function readGet(name, id) {
    logMisconfiguredSupabaseRead(name);
    const primary = pickReadAdapter(name);
    if (primary === jsonAdapter) {
      return jsonAdapter.get(name, id);
    }
    try {
      const row = await supabaseAdapter.get(name, id);
      logStorageEvent('store_read_ok', { collection: name, source: 'supabase', op: 'get', id });
      return row;
    } catch (err) {
      logStorageEvent('store_read_fallback', {
        collection: name,
        source: 'json',
        op: 'get',
        id,
        error: String(err?.message || err),
      });
      const row = await jsonAdapter.get(name, id);
      logStorageEvent('store_read_ok_after_fallback', { collection: name, source: 'json', op: 'get', id });
      return row;
    }
  }

  async function readSummarize(name) {
    logMisconfiguredSupabaseRead(name);
    const primary = pickReadAdapter(name);
    if (primary === jsonAdapter) {
      return jsonAdapter.summarize(name);
    }
    try {
      const s = await supabaseAdapter.summarize(name);
      logStorageEvent('store_read_ok', { collection: name, source: 'supabase', op: 'summarize' });
      return s;
    } catch (err) {
      logStorageEvent('store_read_fallback', {
        collection: name,
        source: 'json',
        op: 'summarize',
        error: String(err?.message || err),
      });
      const s = await jsonAdapter.summarize(name);
      logStorageEvent('store_read_ok_after_fallback', { collection: name, source: 'json', op: 'summarize' });
      return s;
    }
  }

  function shouldDualWriteToSupabase(name) {
    if (mode !== 'dual') return false;
    if (!writeSupabase) return false;
    return coreSet.has(name) && migratedCoreSet.has(name);
  }

  function shouldWriteToSupabaseOnly(name) {
    if (mode !== 'supabase') return false;
    if (!writeSupabase) return false;
    return migratedCoreSet.has(name);
  }

  async function dualWrite(name, fnName, args) {
    const res = await writeJson[fnName](...args);
    if (shouldDualWriteToSupabase(name)) {
      try {
        await writeSupabase[fnName](...args);
        const extra =
          fnName === 'replaceAll' && Array.isArray(args[1])
            ? { row_count: args[1].length }
            : {};
        logStorageEvent('store_dual_write_ok', { collection: name, op: fnName, ...extra });
      } catch (err) {
        logStorageEvent('store_dual_write_supabase_fail', {
          collection: name,
          op: fnName,
          error: String(err?.message || err),
          note: 'json_write_committed',
        });
      }
    }
    return res;
  }

  return {
    storage_mode: mode,
    runtime_mode: getRuntimeMode(),
    supabase_connectivity_text: connectivityText,
    supabase_configured: supaCfg.configured,
    storage_read_preference: readPreference,
    live_dual_write_collections: CORE_DUAL_WRITE_COLLECTIONS.slice(),
    async checkSupabaseConnectivity(table = 'g1cos_work_items') {
      if (!supaCfg.configured) return { ok: false, error: 'supabase_not_configured' };
      return supabaseAdapter.checkConnectivity({ table });
    },
    async summarizeJson(name) {
      return jsonAdapter.summarize(name);
    },
    async summarizeSupabase(name) {
      if (!supaCfg.configured) return { ok: false, error: 'supabase_not_configured' };
      return supabaseAdapter.summarize(name);
    },
    async listJson(name, query) {
      return jsonAdapter.list(name, query);
    },
    async listSupabase(name, query) {
      if (!supaCfg.configured) return null;
      return supabaseAdapter.list(name, query);
    },
    getCollection(name) {
      return { name };
    },
    list: readList,
    get: readGet,
    insert: async (name, record) => {
      if (shouldWriteToSupabaseOnly(name)) return writeSupabase.insert(name, record);
      if (shouldDualWriteToSupabase(name)) return dualWrite(name, 'insert', [name, record]);
      return writeJson.insert(name, record);
    },
    replaceAll: async (name, records) => {
      if (shouldWriteToSupabaseOnly(name)) return writeSupabase.replaceAll(name, records);
      if (shouldDualWriteToSupabase(name)) return dualWrite(name, 'replaceAll', [name, records]);
      return writeJson.replaceAll(name, records);
    },
    update: async (name, id, patch) => {
      if (shouldWriteToSupabaseOnly(name)) return writeSupabase.update(name, id, patch);
      if (shouldDualWriteToSupabase(name)) return dualWrite(name, 'update', [name, id, patch]);
      return writeJson.update(name, id, patch);
    },
    remove: async (name, id) => {
      if (shouldWriteToSupabaseOnly(name)) return writeSupabase.remove(name, id);
      if (shouldDualWriteToSupabase(name)) return dualWrite(name, 'remove', [name, id]);
      return writeJson.remove(name, id);
    },
    upsert: async (name, record, key = null) => {
      if (shouldWriteToSupabaseOnly(name)) return writeSupabase.upsert(name, record, key);
      if (shouldDualWriteToSupabase(name)) return dualWrite(name, 'upsert', [name, record, key]);
      return writeJson.upsert(name, record, key);
    },
    summarize: readSummarize,
  };
}
