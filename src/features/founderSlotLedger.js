/**
 * Founder Slot Ledger — founder가 명시적으로 답변/제공한 요구사항/가정의 SSOT.
 *
 * Resolved slot은 founder가 직접 모순/재오픈 하지 않는 한 다시 질문하지 않는다.
 * thread + project_id 양쪽에 연결. 디스크 persist + startup hydration.
 */

import { readJsonArray, writeJsonArray, ensureJsonFile } from '../storage/jsonStore.js';
import { DATA_DIR } from '../storage/paths.js';
import path from 'path';

const LEDGER_FILE = path.join(DATA_DIR, 'founder-slot-ledger.json');

function resolveLedgerPath() {
  const v = process.env.FOUNDER_SLOT_LEDGER_FILE;
  if (v && String(v).trim()) return path.isAbsolute(v) ? v : path.resolve(process.cwd(), v);
  return LEDGER_FILE;
}

/** @type {Map<string, object>} threadKey -> ledger */
const ledgerByThread = new Map();

const SLOT_NAMES = [
  'project_goal',
  'product_label',
  'active_topic_anchor',
  'primary_user_problem',
  'primary_use_case',
  'user_segments',
  'city_scope',
  'benchmark_family',
  'requested_deliverables',
  'document_ingested',
  'locked_requirements_summary',
  'locked_direction_summary',
];

function makeEmptyLedger(threadKey, projectId) {
  const slots = {};
  for (const name of SLOT_NAMES) {
    slots[name] = { value: null, resolved: false, resolved_at: null, source: null };
  }
  return {
    thread_key: threadKey,
    project_id: projectId || null,
    slots,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function getOrCreateLedger(threadKey, projectId) {
  let ledger = ledgerByThread.get(threadKey);
  if (!ledger) {
    ledger = makeEmptyLedger(threadKey, projectId);
    ledgerByThread.set(threadKey, ledger);
  }
  if (projectId && !ledger.project_id) {
    ledger.project_id = projectId;
  }
  return ledger;
}

export function getLedger(threadKey) {
  return ledgerByThread.get(threadKey) || null;
}

/**
 * Resolve a slot with a value. Once resolved, cannot be re-asked unless explicitly reopened.
 */
export function resolveSlot(threadKey, slotName, value, source) {
  const ledger = getOrCreateLedger(threadKey);
  if (!ledger.slots[slotName]) return false;

  ledger.slots[slotName] = {
    value,
    resolved: true,
    resolved_at: new Date().toISOString(),
    source: source || 'founder_explicit',
  };
  ledger.updated_at = new Date().toISOString();
  persistLedger(ledger);
  return true;
}

/**
 * Reopen a previously resolved slot (founder contradiction or explicit request).
 */
export function reopenSlot(threadKey, slotName) {
  const ledger = ledgerByThread.get(threadKey);
  if (!ledger?.slots[slotName]) return false;

  ledger.slots[slotName] = { value: null, resolved: false, resolved_at: null, source: null };
  ledger.updated_at = new Date().toISOString();
  persistLedger(ledger);
  return true;
}

export function isSlotResolved(threadKey, slotName) {
  const ledger = ledgerByThread.get(threadKey);
  return ledger?.slots[slotName]?.resolved || false;
}

export function getResolvedSlots(threadKey) {
  const ledger = ledgerByThread.get(threadKey);
  if (!ledger) return {};
  const resolved = {};
  for (const [name, slot] of Object.entries(ledger.slots)) {
    if (slot.resolved) resolved[name] = slot.value;
  }
  return resolved;
}

export function getUnresolvedSlots(threadKey) {
  const ledger = ledgerByThread.get(threadKey);
  if (!ledger) return SLOT_NAMES.slice();
  return Object.entries(ledger.slots)
    .filter(([, slot]) => !slot.resolved)
    .map(([name]) => name);
}

/**
 * Bulk-resolve multiple slots (e.g. from document ingestion or kickoff answers).
 */
export function resolveSlotsBulk(threadKey, entries, source) {
  const ledger = getOrCreateLedger(threadKey);
  for (const [name, value] of Object.entries(entries)) {
    if (ledger.slots[name] && value != null) {
      ledger.slots[name] = {
        value,
        resolved: true,
        resolved_at: new Date().toISOString(),
        source: source || 'bulk',
      };
    }
  }
  ledger.updated_at = new Date().toISOString();
  persistLedger(ledger);
}

export function listLedgers() {
  return [...ledgerByThread.values()];
}

function persistLedger(ledger) {
  const fp = resolveLedgerPath();
  readJsonArray(fp)
    .then((arr) => {
      const idx = arr.findIndex((l) => l.thread_key === ledger.thread_key);
      if (idx >= 0) arr[idx] = ledger;
      else arr.push(ledger);
      return writeJsonArray(fp, arr);
    })
    .catch(() => {});
}

export async function loadSlotLedgersFromDisk() {
  const fp = resolveLedgerPath();
  await ensureJsonFile(fp, '[]');
  const arr = await readJsonArray(fp);
  for (const ledger of arr) {
    if (ledger.thread_key) {
      ledgerByThread.set(ledger.thread_key, ledger);
    }
  }
  return arr.length;
}

export function _resetForTest() {
  ledgerByThread.clear();
}
