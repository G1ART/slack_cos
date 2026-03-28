import { COLLECTION_DEFS, COLLECTION_NAMES } from './types.js';
import { createJsonStoreAdapter } from './jsonStoreAdapter.js';

function safeCount(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

export async function buildMigrationPlan({ dryRun = true } = {}) {
  const json = createJsonStoreAdapter();
  const startedAt = new Date().toISOString();

  const collections = [];
  const errors = [];

  for (const name of COLLECTION_NAMES) {
    try {
      // list() without query gives full collection snapshot
      const all = await json.list(name);
      const def = COLLECTION_DEFS[name];
      collections.push({
        collection: name,
        table: def?.supabaseTable || `g1cos_${name}`,
        rowCount: safeCount(all),
        dryRun: true,
        mapping: '1:1 field mapping (record shape preserved)',
      });
    } catch (e) {
      errors.push({ collection: name, error: String(e?.message || e) });
    }
  }

  const finishedAt = new Date().toISOString();

  return {
    dryRun,
    startedAt,
    finishedAt,
    collections,
    errors,
    summary: {
      totalCollections: collections.length,
      totalRows: collections.reduce((acc, c) => acc + (c.rowCount || 0), 0),
      hasErrors: errors.length > 0,
    },
  };
}

export function formatMigrationPlanForSlack(plan) {
  const lines = [];
  lines.push('저장소 마이그레이션 계획 (dry-run)');
  lines.push(`- dryRun: ${plan.dryRun ? 'true' : 'false'}`);
  lines.push(`- startedAt: ${plan.startedAt}`);
  lines.push(`- finishedAt: ${plan.finishedAt}`);
  lines.push('');
  lines.push('[collection -> table]');
  for (const c of plan.collections) {
    lines.push(`- ${c.collection} -> ${c.table} : ${c.rowCount} rows`);
  }
  if (plan.errors.length) {
    lines.push('');
    lines.push('[errors]');
    for (const e of plan.errors) lines.push(`- ${e.collection}: ${e.error}`);
  }
  lines.push('');
  lines.push('idempotent 설계: 동일 레코드 shape/ID 기반으로 UPSERT 가능하도록 매핑');
  return lines.join('\n');
}

