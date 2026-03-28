import { createJsonStoreAdapter } from './jsonStoreAdapter.js';
import { getSupabaseClientConfig, supabaseCheckConnectivity, supabaseCountRows, supabaseGetLatestUpdatedAt, supabaseRestQuery, supabaseRestUpsert, supabaseRestInsert, supabaseRestDelete } from './supabaseClient.js';
import { getCollectionDef } from './types.js';

export function createSupabaseStoreAdapter() {
  const json = createJsonStoreAdapter();
  const supaCfg = getSupabaseClientConfig();

  async function withFallback(fn, fallbackValue) {
    if (!supaCfg.configured) return fallbackValue;
    return fn();
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toArrayRow(name, def, record, now) {
    const pkCol = def.idField;
    const pkValue = record?.[pkCol];
    const createdAt = def.createdAtField ? record?.[def.createdAtField] || now : now;
    const updatedAt = def.updatedAtField ? record?.[def.updatedAtField] || createdAt || now : now;

    const payload = { ...record, created_at: createdAt, updated_at: updatedAt };

    // essential index columns(초기 live 대상)
    if (name === 'work_items') {
      return {
        [pkCol]: pkValue,
        project_key: record.project_key,
        tool_key: record.tool_key,
        work_type: record.work_type,
        status: record.status,
        priority: record.priority,
        owner_type: record.owner_type,
        assigned_persona: record.assigned_persona,
        assigned_tool: record.assigned_tool,
        approval_required: Boolean(record.approval_required),
        approval_status: record.approval_status,
        branch_name: record.branch_name,
        payload,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }

    if (name === 'work_runs') {
      return {
        [pkCol]: pkValue,
        work_id: record.work_id,
        project_key: record.project_key,
        tool_key: record.tool_key,
        adapter_type: record.adapter_type,
        status: record.status,
        qa_status: record.qa_status,
        result_status: record.result_status,
        payload,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }

    if (name === 'approvals') {
      return {
        [pkCol]: pkValue,
        status: record.status,
        approval_key: record.approval_key,
        approval_category: record.approval_category,
        priority_score: record.priority_score ?? null,
        channel_sensitivity: record.channel_sensitivity ?? null,
        channel_context: record.channel_context ?? null,
        payload,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }

    if (name === 'plans') {
      return {
        plan_id: pkValue,
        status: record.status ?? null,
        approval_required: Boolean(record.approval_required),
        payload,
        created_at: createdAt,
        updated_at: updatedAt,
      };
    }

    // fallback generic(향후 확장)
    return {
      [pkCol]: pkValue,
      payload,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  function toObjectMapRow(def, record, key, now) {
    const objectKey = key || record?.key || record?.id || record?.[def.idField] || record;
    const valueToStore = Object.prototype.hasOwnProperty.call(record || {}, 'value') ? record.value : record;
    const createdAt = now;
    const updatedAt = now;
    return {
      key: objectKey,
      value: valueToStore,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async function listArray(def, pkCol, name, query) {
    const table = def.supabaseTable;
    const orderBy = query?._orderBy;
    const orderDir = String(query?._orderDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const limit = Number.isFinite(query?._limit) ? query._limit : null;

    const select = `payload,${pkCol},${def.createdAtField || 'created_at'},${def.updatedAtField || 'updated_at'}`;

    const filters = {};
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k.startsWith('_')) continue;
        if (v === undefined || v === null) continue;
        filters[k] = v;
      }
    }

    const order = orderBy ? `${orderBy}.${orderDir}` : null;
    const rows = await supabaseRestQuery({ table, select, filters, order, limit: limit ?? undefined });
    return rows.map((r) => ({
      ...(r.payload || {}),
      [pkCol]: r[pkCol],
      created_at: r[def.createdAtField],
      updated_at: r[def.updatedAtField],
    }));
  }

  async function listObjectMap(def, query) {
    const table = def.supabaseTable;
    const orderBy = query?._orderBy || 'updated_at';
    const orderDir = String(query?._orderDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const limit = Number.isFinite(query?._limit) ? query._limit : null;
    const includeKeys = Boolean(query?._includeKeys);

    const select = includeKeys ? `key,value,created_at,updated_at` : `value`;
    const filters = {};
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k.startsWith('_')) continue;
        if (v === undefined || v === null) continue;
        // key/value 필터만 초기 지원
        if (k === 'key' || k === 'value') filters[k] = v;
      }
    }

    const order = `${orderBy}.${orderDir}`;
    const rows = await supabaseRestQuery({ table, select, filters, order, limit: limit ?? undefined });
    if (includeKeys) return rows.map((r) => ({ key: r.key, value: r.value }));
    return rows.map((r) => r.value);
  }

  return {
    _adapterName: supaCfg.configured ? 'supabase_live' : 'supabase_disabled',
    _supabaseConfig: supaCfg,

    async checkConnectivity({ table = 'g1cos_work_items' } = {}) {
      if (!supaCfg.configured) return { ok: false, error: 'supabase_not_configured' };
      const res = await supabaseCheckConnectivity({ table });
      return res;
    },

    async list(name, query) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.list(name, query);

      if (def.kind === 'array') {
        return listArray(def, def.idField, name, query || {});
      }
      return listObjectMap(def, query || {});
    },

    async get(name, id) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.get(name, id);

      if (def.kind === 'array') {
        const pkCol = def.idField;
        const table = def.supabaseTable;
        const select = `payload,${pkCol},${def.createdAtField || 'created_at'},${def.updatedAtField || 'updated_at'}`;
        const rows = await supabaseRestQuery({
          table,
          select,
          filters: { [pkCol]: id },
          limit: 1,
        });
        const r = Array.isArray(rows) ? rows[0] : null;
        return r
          ? {
              ...(r.payload || {}),
              [pkCol]: r[pkCol],
              created_at: r[def.createdAtField],
              updated_at: r[def.updatedAtField],
            }
          : null;
      }

      // object_map
      const table = def.supabaseTable;
      const rows = await supabaseRestQuery({
        table,
        select: 'value',
        filters: { key: id },
        limit: 1,
      });
      const r = Array.isArray(rows) ? rows[0] : null;
      return r ? r.value : null;
    },

    async insert(name, record) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.insert(name, record);

      const now = nowIso();
      if (def.kind === 'array') {
        const row = toArrayRow(name, def, record, now);
        const pkCol = def.idField;
        await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: pkCol, rows: row });
        return record;
      }

      const row = toObjectMapRow(def, record, null, now);
      await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: 'key', rows: row });
      return record;
    },

    async replaceAll(name, records) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.replaceAll(name, records);

      const now = nowIso();
      if (def.kind === 'array') {
        const pkCol = def.idField;
        const table = def.supabaseTable;
        const rows = (records || []).map((r) => toArrayRow(name, def, r, now));
        await supabaseRestUpsert({ table, pkColumn: pkCol, rows });
        return { ok: true };
      }

      const rows = Object.entries(records || {}).map(([k, v]) => toObjectMapRow(def, { key: k, value: v }, k, now));
      await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: 'key', rows });
      return { ok: true };
    },

    async update(name, id, patch) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.update(name, id, patch);

      if (def.kind === 'array') {
        const pkCol = def.idField;
        const existing = await this.get(name, id);
        if (!existing) return { ok: false, reason: 'not_found' };
        const next = { ...existing, ...patch };
        if (def.updatedAtField) next[def.updatedAtField] = nowIso();
        await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: pkCol, rows: toArrayRow(name, def, next, nowIso()) });
        return { ok: true, record: next };
      }

      const now = nowIso();
      const valueToStore = Object.prototype.hasOwnProperty.call(patch || {}, 'value') ? patch.value : patch;
      const row = toObjectMapRow(def, { key: id, value: valueToStore }, id, now);
      await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: 'key', rows: row });
      return { ok: true };
    },

    async remove(name, id) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.remove(name, id);

      if (def.kind === 'array') {
        await supabaseRestDelete({ table: def.supabaseTable, pkColumn: def.idField, pkValue: id });
        return { ok: true };
      }

      await supabaseRestDelete({ table: def.supabaseTable, pkColumn: 'key', pkValue: id });
      return { ok: true };
    },

    async upsert(name, record, key = null) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.upsert(name, record, key);

      const now = nowIso();
      if (def.kind === 'array') {
        const row = toArrayRow(name, def, record, now);
        const pkCol = def.idField;
        await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: pkCol, rows: row });
        return record;
      }

      // object_map
      const row = toObjectMapRow(def, record, key, now);
      await supabaseRestUpsert({ table: def.supabaseTable, pkColumn: 'key', rows: row });
      return record;
    },

    async summarize(name) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`supabase store: unknown collection ${name}`);
      if (!supaCfg.configured) return json.summarize(name);

      const table = def.supabaseTable;
      const total = await supabaseCountRows(table);
      const maxUpdatedAt = def.updatedAtField ? await supabaseGetLatestUpdatedAt(table, def.updatedAtField) : null;
      return { total, maxUpdatedAt };
    },
  };
}

