import 'dotenv/config';

import { createJsonStoreAdapter } from '../src/storage/core/jsonStoreAdapter.js';
import { createSupabaseStoreAdapter } from '../src/storage/core/supabaseStoreAdapter.js';
import { getSupabaseClientConfig } from '../src/storage/core/supabaseClient.js';

import {
  CORE_DUAL_WRITE_COLLECTIONS,
} from '../src/storage/core/types.js';
import { getCollectionDef } from '../src/storage/core/types.js';

import { fileURLToPath } from 'url';

function parseArgs(argv) {
  const args = {
    collections: null,
    cleanup: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--cleanup') args.cleanup = true;
    else if (a.startsWith('--collections=')) {
      args.collections = a.split('=').slice(1).join('=');
    } else if (a === '--collections') {
      args.collections = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--collection=')) {
      args.collections = a.split('=').slice(1).join('=');
    } else if (a === '--collection') {
      args.collections = argv[i + 1];
      i += 1;
    } else {
      // ignore unknown
    }
  }

  if (typeof args.collections === 'string') {
    args.collections = args.collections
      .split(',')
      .map((s) => String(s || '').trim())
      .filter(Boolean);
  }

  if (!Array.isArray(args.collections)) {
    args.collections = ['project_context']; // default
  }

  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function stableStringify(obj) {
  if (obj === undefined) return 'undefined';
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function stripTimestamps(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const copy = { ...rec };
  delete copy.created_at;
  delete copy.updated_at;
  return copy;
}

function assertOk(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion_failed');
}

function normalizeExpectedCollections(inputCollections) {
  const allowed = new Set([
    'project_context',
    'environment_context',
    'work_items',
    'approvals',
    'work_runs',
  ]);

  const selected = (inputCollections || []).filter((c) => allowed.has(c));
  if (!selected.length) throw new Error('no_valid_collections_selected');
  return selected;
}

function buildTestData() {
  const ts = Date.now();
  const suffix = String(ts).slice(-6);

  const channelId = `SMOKE-C${suffix}`;
  const projectKey1 = 'slack_cos';
  const projectKey2 = 'shared_tools';

  const envKey1 = 'dev';
  const envKey2 = 'staging';

  const workId = `WRK-${new Date().toISOString().slice(2, 8).replace(/-/g, '')}-${String(ts % 100).padStart(2, '0')}`;
  const runId = `RUN-${new Date().toISOString().slice(2, 8).replace(/-/g, '')}-${String((ts + 1) % 100).padStart(2, '0')}`;

  const createdAt1 = nowIso();
  const createdAt2 = nowIso();

  const workItemBase = {
    id: workId,
    project_key: 'slack_cos',
    tool_key: 'cursor',
    work_type: 'refactor',
    status: 'draft',
    priority: 'normal',
    owner_type: 'persona',
    assigned_persona: 'general_cos',
    assigned_tool: 'manual',
    approval_required: false,
    approval_status: 'not_required',
    branch_name: `smoke/${suffix}`,
    created_at: createdAt1,
    updated_at: createdAt1,
    // any extra fields go into payload for Supabase adapter
    title: 'smoke work item',
    brief: 'smoke brief',
  };

  const workRunBase = {
    run_id: runId,
    work_id: workId,
    project_key: 'slack_cos',
    tool_key: 'cursor',
    adapter_type: 'cursor',
    status: 'drafted',
    qa_status: 'pending',
    result_status: 'none',
    created_at: createdAt1,
    updated_at: createdAt1,
    executor_type: 'cursor',
    executor_session_label: 'smoke',
    notes: 'smoke run',
  };

  const approvalId = `APR-SMOKE-${suffix}`;
  const approvalKey = `FIN-SMOKE-${suffix}`;
  const approvalBase = {
    id: approvalId,
    status: 'pending',
    approval_key: approvalKey,
    approval_category: 'FIN',
    priority_score: null,
    channel_sensitivity: 'low',
    channel_context: 'strategy_finance',
    created_at: createdAt1,
    updated_at: createdAt1,
    title: 'smoke approval',
    question: 'smoke question',
  };

  // updated versions
  const workItemUpdated = { ...workItemBase, status: 'in_progress', updated_at: createdAt2 };
  const workRunUpdated = { ...workRunBase, status: 'dispatched', updated_at: createdAt2 };
  const approvalUpdated = { ...approvalBase, status: 'approved', updated_at: createdAt2 };

  return {
    channelId,
    projectKey1,
    projectKey2,
    envKey1,
    envKey2,
    workId,
    runId,
    workItemBase,
    workItemUpdated,
    workRunBase,
    workRunUpdated,
    approvalBase,
    approvalUpdated,
  };
}

async function runForCollection({ adapterName, adapter, collection, cleanup, data }) {
  // Each adapter manages its own persistence; tests are repeated for JSON and Supabase.
  const stagePrefix = `[${adapterName}/${collection}]`;
  const createdAt1 = data.workItemBase?.created_at;

  if (collection === 'project_context') {
    const key = data.channelId;
    const value1 = data.projectKey1;
    const value2 = data.projectKey2;

    const before = await adapter.summarize('project_context');
    await adapter.upsert('project_context', { key, value: value1 });
    const got1 = await adapter.get('project_context', key);
    assertOk(got1 === value1, `${stagePrefix} get after upsert mismatch`);
    const afterInsert = await adapter.summarize('project_context');

    await adapter.upsert('project_context', { key, value: value2 });
    const got2 = await adapter.get('project_context', key);
    assertOk(got2 === value2, `${stagePrefix} get after update mismatch`);
    const afterUpdate = await adapter.summarize('project_context');

    if (cleanup) await adapter.remove('project_context', key);

    return {
      ok: true,
      before,
      afterInsert,
      afterUpdate,
      sample: { key, value: got2, updated_at: null },
      timestamps: { note: 'project_context is key/value only; timestamps are not present in JSON value.' },
      compareSample: { key, value: got2 },
    };
  }

  if (collection === 'environment_context') {
    const key = data.channelId;
    const value1 = data.envKey1;
    const value2 = data.envKey2;

    const before = await adapter.summarize('environment_context');
    await adapter.upsert('environment_context', { key, value: value1 });
    const got1 = await adapter.get('environment_context', key);
    assertOk(got1 === value1, `${stagePrefix} get after upsert mismatch`);
    const afterInsert = await adapter.summarize('environment_context');

    await adapter.upsert('environment_context', { key, value: value2 });
    const got2 = await adapter.get('environment_context', key);
    assertOk(got2 === value2, `${stagePrefix} get after update mismatch`);
    const afterUpdate = await adapter.summarize('environment_context');

    if (cleanup) await adapter.remove('environment_context', key);

    return {
      ok: true,
      before,
      afterInsert,
      afterUpdate,
      sample: { key, value: got2, updated_at: null },
      timestamps: { note: 'environment_context is key/value only; timestamps are not present in JSON value.' },
      compareSample: { key, value: got2 },
    };
  }

  if (collection === 'work_items') {
    const id = data.workItemBase.id;
    const before = await adapter.summarize('work_items');
    await adapter.upsert('work_items', data.workItemBase);
    const got1 = await adapter.get('work_items', id);
    assertOk(got1 && got1.id === id, `${stagePrefix} get after upsert missing`);
    const afterInsert = await adapter.summarize('work_items');

    await adapter.update('work_items', id, data.workItemUpdated);
    const got2 = await adapter.get('work_items', id);
    assertOk(got2 && got2.status === data.workItemUpdated.status, `${stagePrefix} get after update status mismatch`);
    const afterUpdate = await adapter.summarize('work_items');

    if (cleanup) {
      await adapter.remove('work_items', id);
    }

    return {
      ok: true,
      before,
      afterInsert,
      afterUpdate,
      sample: got2,
      timestamps: {
        created_at: got2?.created_at || null,
        updated_at: got2?.updated_at || null,
      },
      compareSample: stripTimestamps(got2),
    };
  }

  if (collection === 'approvals') {
    const id = data.approvalBase.id;
    const before = await adapter.summarize('approvals');
    await adapter.upsert('approvals', data.approvalBase);
    const got1 = await adapter.get('approvals', id);
    assertOk(got1 && got1.id === id, `${stagePrefix} get after upsert missing`);
    const afterInsert = await adapter.summarize('approvals');

    await adapter.update('approvals', id, data.approvalUpdated);
    const got2 = await adapter.get('approvals', id);
    assertOk(got2 && got2.status === data.approvalUpdated.status, `${stagePrefix} get after update status mismatch`);
    const afterUpdate = await adapter.summarize('approvals');

    if (cleanup) await adapter.remove('approvals', id);

    return {
      ok: true,
      before,
      afterInsert,
      afterUpdate,
      sample: got2,
      timestamps: {
        created_at: got2?.created_at || null,
        updated_at: got2?.updated_at || null,
      },
      compareSample: stripTimestamps(got2),
    };
  }

  if (collection === 'work_runs') {
    const runId = data.workRunBase.run_id;
    const workId = data.workRunBase.work_id;

    // FK requires work_items exists in Supabase. Ensure it exists per adapter.
    await adapter.upsert('work_items', data.workItemBase);

    const before = await adapter.summarize('work_runs');
    await adapter.upsert('work_runs', data.workRunBase);
    const got1 = await adapter.get('work_runs', runId);
    assertOk(got1 && got1.run_id === runId, `${stagePrefix} get after upsert missing`);
    const afterInsert = await adapter.summarize('work_runs');

    await adapter.update('work_runs', runId, data.workRunUpdated);
    const got2 = await adapter.get('work_runs', runId);
    assertOk(got2 && got2.status === data.workRunUpdated.status, `${stagePrefix} get after update status mismatch`);
    const afterUpdate = await adapter.summarize('work_runs');

    if (cleanup) {
      await adapter.remove('work_runs', runId);
      await adapter.remove('work_items', workId);
    }

    return {
      ok: true,
      before,
      afterInsert,
      afterUpdate,
      sample: got2,
      timestamps: {
        created_at: got2?.created_at || null,
        updated_at: got2?.updated_at || null,
      },
      compareSample: stripTimestamps(got2),
    };
  }

  throw new Error(`unknown collection in smoke test: ${collection}`);
}

function formatSummaryLine({ ok, before, afterUpdate, sample, timestamps }) {
  const totalBefore = before?.total ?? 'n/a';
  const totalAfter = afterUpdate?.total ?? 'n/a';
  const updatedAt = timestamps?.updated_at || 'n/a';
  return `- ${ok ? 'PASS' : 'FAIL'} | total: ${totalBefore} -> ${totalAfter} | updated_at: ${updatedAt} | sample: ${stableStringify(stripTimestamps(sample)).slice(0, 220)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log([
      'usage:',
      'node scripts/storage-smoke-test.js --collection project_context',
      'node scripts/storage-smoke-test.js --collections project_context,work_items,work_runs',
      'optional:',
      '  --cleanup  // inserted test rows will be removed at the end',
      '',
      'collections:',
      `  ${CORE_DUAL_WRITE_COLLECTIONS.join(', ')} (+ allowed: environment_context, approvals)`,
    ].join('\n'));
    process.exit(0);
  }

  const selectedCollections = normalizeExpectedCollections(args.collections);
  const cleanup = Boolean(args.cleanup);

  const jsonAdapter = createJsonStoreAdapter();
  const supaAdapter = createSupabaseStoreAdapter();
  const supaCfg = getSupabaseClientConfig();

  const data = buildTestData();

  const results = [];

  // JSON tests
  for (const c of selectedCollections) {
    try {
      const r = await runForCollection({
        adapterName: 'json',
        adapter: jsonAdapter,
        collection: c,
        cleanup,
        data,
      });
      results.push({ adapter: 'json', collection: c, ...r });
    } catch (e) {
      results.push({
        adapter: 'json',
        collection: c,
        ok: false,
        stage: e?.stage || 'unknown',
        error: String(e?.message || e),
        stack: e?.stack || null,
      });
      break;
    }
  }

  // Supabase tests (only if configured)
  for (const c of selectedCollections) {
    if (!supaCfg.configured) {
      const err = new Error('supabase env missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
      results.push({
        adapter: 'supabase',
        collection: c,
        ok: false,
        error: err.message,
        stack: err.stack || null,
        stage: 'preflight_env',
      });
      continue;
    }

    try {
      // connectivity preflight once per collection
      if (typeof supaAdapter.checkConnectivity === 'function') {
        const def = getCollectionDef(c);
        const table = def?.supabaseTable || 'g1cos_work_items';
        const t = await supaAdapter.checkConnectivity({ table });
        assertOk(t?.ok, `supabase connectivity failed: ${t?.error || 'unknown'}`);
      }

      const r = await runForCollection({
        adapterName: 'supabase',
        adapter: supaAdapter,
        collection: c,
        cleanup,
        data,
      });
      results.push({ adapter: 'supabase', collection: c, ...r });
    } catch (e) {
      const msg = String(e?.message || e);
      let hint = null;
      if (/Could not find the table/i.test(msg) || /404/i.test(msg)) {
        hint =
          'Supabase 테이블이 아직 없을 수 있습니다. core 1차 live 마이그레이션을 적용했는지 확인하세요: supabase/migrations/20260319_g1cos_live_core_tables.sql';
      }
      results.push({
        adapter: 'supabase',
        collection: c,
        ok: false,
        stage: e?.stage || 'unknown',
        error: hint ? `${msg}\nHINT: ${hint}` : msg,
        stack: e?.stack || null,
      });
      // keep going to report other collections
    }
  }

  // Cross compare JSON vs Supabase samples (only when both passed)
  for (const c of selectedCollections) {
    const j = results.find((r) => r.adapter === 'json' && r.collection === c && r.ok !== false);
    const s = results.find((r) => r.adapter === 'supabase' && r.collection === c && r.ok !== false);
    if (j && s) {
      const jCmp = stableStringify(j.compareSample ?? stripTimestamps(j.sample));
      const sCmp = stableStringify(s.compareSample ?? stripTimestamps(s.sample));
      results.push({
        adapter: 'compare',
        collection: c,
        ok: jCmp === sCmp,
        error: jCmp === sCmp ? null : 'sample mismatch between json and supabase',
        jsonSample: j.compareSample ?? j.sample,
        supaSample: s.compareSample ?? s.sample,
      });
    }
  }

  // Output
  console.log('=== Storage Smoke Test ===');
  console.log(`collections: ${selectedCollections.join(', ')}`);
  console.log(`cleanup: ${cleanup ? 'enabled' : 'disabled'}`);
  console.log(`supabase configured: ${supaCfg.configured ? 'yes' : 'no'}`);
  console.log('');

  const failed = results.filter((r) => r.ok === false);
  const passed = results.filter((r) => r.ok !== false);

  for (const r of results) {
    if (r.ok === false) {
      console.log(`- ${r.adapter}/${r.collection}: FAIL @ ${r.stage || 'unknown'}`);
      console.log(`  error: ${r.error}`);
      if (r.stack) console.log(`  stack:\n${r.stack}`);
      if (r.adapter === 'compare') {
        console.log(`  jsonSample: ${stableStringify(r.jsonSample).slice(0, 220)}`);
        console.log(`  supaSample: ${stableStringify(r.supaSample).slice(0, 220)}`);
      }
    } else {
      console.log(`- ${r.adapter}/${r.collection}: PASS`);
      if (r.adapter !== 'compare') console.log(formatSummaryLine(r));
    }
  }

  console.log('');
  console.log(`result: ${failed.length ? 'FAIL' : 'PASS'} (passed=${passed.length}, failed=${failed.length})`);

  if (failed.length) process.exit(1);
  return 0;
}

function shouldRunAsMain() {
  const scriptPath = process.argv[1] ? fileURLToPath(new URL(`file://${process.argv[1]}`)) : null;
  const currentPath = fileURLToPath(import.meta.url);
  // process.argv[1] may already be absolute; fallback to endsWith check
  if (!scriptPath) return true;
  return scriptPath === currentPath;
}

if (shouldRunAsMain()) {
  main().catch((e) => {
    console.error('storage-smoke-test fatal error');
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}

