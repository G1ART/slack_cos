#!/usr/bin/env node
/**
 * Phase 4 storage smoke: types + factory shape (no live Supabase).
 */
import assert from 'node:assert/strict';
import { CORE_DUAL_WRITE_COLLECTIONS, COLLECTION_DEFS } from '../src/storage/core/types.js';

assert.ok(CORE_DUAL_WRITE_COLLECTIONS.includes('plans'), 'plans in dual-write set');
assert.equal(COLLECTION_DEFS.plans.supabaseTable, 'g1cos_plans');

const { createStore } = await import('../src/storage/core/storeFactory.js');
const store = createStore({ storageMode: 'json' });
assert.equal(store.storage_mode, 'json');
assert.ok(Array.isArray(store.live_dual_write_collections));
assert.ok(store.live_dual_write_collections.includes('plans'));

console.log('ok: phase4_storage_smoke');
