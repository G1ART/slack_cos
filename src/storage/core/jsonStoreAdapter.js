import {
  readJsonArray,
  readJsonObject,
  writeJsonArray,
  writeJsonObject,
} from '../jsonStore.js';
import { getCollectionDef } from './types.js';

function safeMatchQuery(record, query) {
  if (!query || typeof query !== 'object') return true;
  const entries = Object.entries(query);
  for (const [k, v] of entries) {
    if (v === undefined) continue;
    if (k.startsWith('_')) continue; // special options (_limit, _orderBy, ...)
    const rv = record?.[k];
    if (Array.isArray(v)) {
      if (!v.includes(rv)) return false;
    } else if (rv !== v) {
      return false;
    }
  }
  return true;
}

async function readAll(kind, filePath) {
  if (kind === 'array') return readJsonArray(filePath);
  const obj = await readJsonObject(filePath, {});
  return obj || {};
}

async function writeAll(kind, filePath, value) {
  if (kind === 'array') return writeJsonArray(filePath, value);
  return writeJsonObject(filePath, value);
}

export function createJsonStoreAdapter() {
  return {
    async list(name, query) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      const all = await readAll(def.kind, def.filePath);

      const limit = query?._limit ?? null;
      const orderBy = query?._orderBy ?? null;
      const orderDir = (query?._orderDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

      // Filter query without special options
      const filterQuery = query && typeof query === 'object' ? Object.fromEntries(Object.entries(query).filter(([k]) => !k.startsWith('_'))) : query;

      if (def.kind === 'object_map') {
        const includeKeys = Boolean(query?._includeKeys);
        const keys = Object.keys(all || {});
        const values = keys.map((k) => (includeKeys ? { key: k, value: all[k] } : all[k]));
        if (!filterQuery) return Number.isFinite(limit) ? values.slice(0, limit) : values;
        const filtered = values.filter((r) => safeMatchQuery(r, filterQuery));
        if (Number.isFinite(limit)) return filtered.slice(0, limit);
        return filtered;
      }

      let filtered = all.filter((r) => safeMatchQuery(r, filterQuery));
      if (orderBy) {
        filtered.sort((a, b) => String(b?.[orderBy] || '').localeCompare(String(a?.[orderBy] || '')));
        if (orderDir === 'asc') filtered.reverse();
      }
      if (Number.isFinite(limit)) filtered = filtered.slice(0, limit);
      return filtered;
    },

    async get(name, id) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      if (def.kind === 'object_map') {
        const all = await readAll(def.kind, def.filePath);
        return all?.[id] ?? null;
      }
      const all = await readAll(def.kind, def.filePath);
      return all.find((r) => r?.[def.idField] === id) || null;
    },

    async insert(name, record) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      const all = await readAll(def.kind, def.filePath);
      if (def.kind === 'object_map') {
        const key = record?.key || record?.id || record?.[def.idField];
        if (!key) throw new Error(`core store: object_map insert requires record key`);
        const valueToStore = Object.prototype.hasOwnProperty.call(record || {}, 'value') ? record.value : record;
        const next = { ...(all || {}) };
        next[key] = valueToStore;
        await writeAll(def.kind, def.filePath, next);
        return { key, value: valueToStore };
      }
      const next = [...(all || []), record];
      await writeAll(def.kind, def.filePath, next);
      return record;
    },

    async replaceAll(name, records) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      await writeAll(def.kind, def.filePath, records);
    },

    async update(name, id, patch) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      if (def.kind === 'object_map') {
        const all = await readAll(def.kind, def.filePath);
        const valueToStore = Object.prototype.hasOwnProperty.call(patch || {}, 'value') ? patch.value : patch;
        const next = { ...(all || {}) };
        next[id] = valueToStore;
        await writeAll(def.kind, def.filePath, next);
        return { ok: true };
      }
      if (def.kind !== 'array') throw new Error(`core store: update only supports array/object_map collections`);
      const all = await readAll(def.kind, def.filePath);
      const index = all.findIndex((r) => r?.[def.idField] === id);
      if (index < 0) return { ok: false, reason: 'not_found' };
      all[index] = { ...all[index], ...patch };
      await writeAll(def.kind, def.filePath, all);
      return { ok: true, record: all[index] };
    },

    async remove(name, id) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      if (def.kind === 'object_map') {
        const all = await readAll(def.kind, def.filePath);
        const next = { ...(all || {}) };
        delete next[id];
        await writeAll(def.kind, def.filePath, next);
        return { ok: true };
      }
      if (def.kind !== 'array') throw new Error(`core store: remove only supports array/object_map collections`);
      const all = await readAll(def.kind, def.filePath);
      const next = all.filter((r) => r?.[def.idField] !== id);
      await writeAll(def.kind, def.filePath, next);
      return { ok: true };
    },

    async upsert(name, record, key = null) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      if (def.kind === 'object_map') {
        const objectKey = key || record?.key || record?.id || record?.[def.idField];
        if (!objectKey) throw new Error(`core store: object_map upsert requires key`);
        const valueToStore = Object.prototype.hasOwnProperty.call(record || {}, 'value') ? record.value : record;
        const all = await readAll(def.kind, def.filePath);
        const next = { ...(all || {}) };
        next[objectKey] = valueToStore;
        await writeAll(def.kind, def.filePath, next);
        return { key: objectKey, value: valueToStore };
      }

      if (def.kind !== 'array') throw new Error(`core store: upsert only supports array/object_map collections`);
      const k = key || def.idField;
      const id = record?.[k];
      if (!id) throw new Error(`core store: upsert requires record id`);
      const all = await readAll(def.kind, def.filePath);
      const index = all.findIndex((r) => r?.[def.idField] === id);
      if (index < 0) {
        all.push(record);
      } else {
        all[index] = { ...all[index], ...record };
      }
      await writeAll(def.kind, def.filePath, all);
      return record;
    },

    async summarize(name) {
      const def = getCollectionDef(name);
      if (!def) throw new Error(`core store: unknown collection ${name}`);
      const all = await readAll(def.kind, def.filePath);
      if (def.kind === 'object_map') {
        const values = Object.values(all || {});
        return { total: values.length, maxUpdatedAt: null };
      }
      const total = (all || []).length;
      const updatedAtField = def.updatedAtField;
      let maxUpdatedAt = null;
      for (const r of all || []) {
        const t = updatedAtField ? Date.parse(r?.[updatedAtField] || '') : NaN;
        if (Number.isFinite(t)) {
          const iso = new Date(t).toISOString();
          if (!maxUpdatedAt || String(iso).localeCompare(String(maxUpdatedAt)) > 0) maxUpdatedAt = iso;
        }
      }
      const statusCounts = {};
      for (const r of all || []) {
        const s = r?.status;
        if (!s) continue;
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      }
      return { total, statusCounts, maxUpdatedAt };
    },
  };
}

