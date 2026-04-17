/**
 * W13-B — Rehearsal Eligibility SSOT reader.
 *
 * 목적:
 *  - Supabase 운영 모드에서도 "rehearsal-safe" 로 명시된 경계에서만 bounded live rehearsal 을 허용.
 *  - SSOT 는 로컬 파일(`ops/rehearsal_eligibility.json`). Supabase 의 `project_space_bindings.rehearsal_safety_class_json`
 *    컬럼은 audit-only mirror 이며, 런타임 판단은 항상 이 파일을 우선한다.
 *
 * 파일 스키마:
 *  {
 *    "schema_version": 1,
 *    "entries": [
 *      {
 *        "project_space_key": "<psk>",
 *        "target_sink": "github" | "vercel" | "railway" | "supabase",
 *        "class": "sandbox_safe" | "staging" | "production",
 *        "allowed_live_writers": ["github", ...],
 *        "notes": "...",
 *        "last_reviewed_at": "ISO",
 *        "reviewed_by": "operator id"
 *      }
 *    ]
 *  }
 *
 * 판단 규칙:
 *  - entry 가 없거나 class 가 sandbox_safe 가 아닌 경우는 production 으로 fail-closed.
 *  - sandbox_safe 이고 현재 sink 가 allowed_live_writers 에 포함되어 있어야 live writer 로 통과.
 *  - staging 은 이번 에픽에서 live write 를 금지하고 smoke/existence_only 까지만 허용한다 (보수적 경계).
 *
 * 이 모듈은 파일이 `.gitignore` 에 들어 있어도 작동해야 하며, 누락 시 빈 set 을 돌려준다.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_REHEARSAL_ELIGIBILITY_PATH = 'ops/rehearsal_eligibility.json';
export const REHEARSAL_CLASSES = Object.freeze(['sandbox_safe', 'staging', 'production']);

function asString(v) {
  return v == null ? '' : String(v);
}

function normalize(v) {
  return asString(v).trim();
}

function safeRead(absPath) {
  try {
    if (!fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.entries)) parsed.entries = [];
    return parsed;
  } catch (_e) {
    return null;
  }
}

/**
 * @param {{ filePath?: string, now?: Date }} [opts]
 * @returns {{
 *   schema_version: number,
 *   loaded_from: string | null,
 *   entries: Array<{
 *     project_space_key: string,
 *     target_sink: string,
 *     class: 'sandbox_safe' | 'staging' | 'production',
 *     allowed_live_writers: string[],
 *     notes: string,
 *     last_reviewed_at: string | null,
 *     reviewed_by: string | null
 *   }>
 * }}
 */
export function readRehearsalEligibility(opts = {}) {
  const filePath = opts.filePath || DEFAULT_REHEARSAL_ELIGIBILITY_PATH;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const parsed = safeRead(abs);
  if (!parsed) {
    return { schema_version: 1, loaded_from: null, entries: [] };
  }
  const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const cls = normalize(raw.class).toLowerCase();
      if (!REHEARSAL_CLASSES.includes(cls)) return null;
      const psk = normalize(raw.project_space_key);
      const sink = normalize(raw.target_sink).toLowerCase();
      if (!psk || !sink) return null;
      const allowed = Array.isArray(raw.allowed_live_writers)
        ? raw.allowed_live_writers.map((s) => normalize(s).toLowerCase()).filter(Boolean)
        : [];
      return {
        project_space_key: psk,
        target_sink: sink,
        class: cls,
        allowed_live_writers: allowed,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        last_reviewed_at: typeof raw.last_reviewed_at === 'string' ? raw.last_reviewed_at : null,
        reviewed_by: typeof raw.reviewed_by === 'string' ? raw.reviewed_by : null,
      };
    })
    .filter(Boolean);
  return {
    schema_version: Number(parsed.schema_version) || 1,
    loaded_from: abs,
    entries,
  };
}

/**
 * 현재 (project_space_key × sink) 이 sandbox_safe 로 분류되어 있는가.
 * @param {{ project_space_key: string, sink: string, eligibility?: ReturnType<typeof readRehearsalEligibility> }} args
 */
export function isRehearsalSafeForProjectSpaceAndSink({
  project_space_key,
  sink,
  eligibility,
}) {
  const e = eligibility || readRehearsalEligibility();
  const psk = normalize(project_space_key);
  const s = normalize(sink).toLowerCase();
  if (!psk || !s) return false;
  const match = e.entries.find(
    (row) => row.project_space_key === psk && row.target_sink === s,
  );
  return !!(match && match.class === 'sandbox_safe' && match.allowed_live_writers.includes(s));
}

/**
 * 현재 project_space_key 가 적어도 하나 이상 sandbox_safe 로 분류된 sink 를 가지는가.
 * @param {{ project_space_key?: string, eligibility?: ReturnType<typeof readRehearsalEligibility> }} [args]
 */
export function hasAnySandboxSafeEntry({ project_space_key, eligibility } = {}) {
  const e = eligibility || readRehearsalEligibility();
  const psk = normalize(project_space_key);
  return e.entries.some(
    (row) => row.class === 'sandbox_safe' && (!psk || row.project_space_key === psk),
  );
}

/**
 * 허용된 live writer sink 의 이름 배열.
 * @param {{ project_space_key: string, eligibility?: ReturnType<typeof readRehearsalEligibility> }} args
 * @returns {string[]}
 */
export function listAllowedWritersForSandbox({ project_space_key, eligibility }) {
  const e = eligibility || readRehearsalEligibility();
  const psk = normalize(project_space_key);
  const set = new Set();
  for (const row of e.entries) {
    if (row.class !== 'sandbox_safe') continue;
    if (psk && row.project_space_key !== psk) continue;
    for (const w of row.allowed_live_writers) set.add(w);
  }
  return [...set].sort();
}

/**
 * entry 가 하나도 없을 때의 기본값 — production 취급 (fail-closed).
 * @param {{ project_space_key: string, sink: string, eligibility?: ReturnType<typeof readRehearsalEligibility> }} args
 */
export function isProductionTarget({ project_space_key, sink, eligibility }) {
  const e = eligibility || readRehearsalEligibility();
  const psk = normalize(project_space_key);
  const s = normalize(sink).toLowerCase();
  const match = e.entries.find(
    (row) => row.project_space_key === psk && row.target_sink === s,
  );
  if (!match) return true;
  return match.class === 'production';
}

/**
 * 주어진 writers 맵에서 rehearsal allowlist 에 포함된 sink 만 남기고 나머지는 제거.
 * sandbox_safe entry 가 없으면 빈 객체 반환 (fail-closed).
 * @param {Record<string, unknown>} writers
 * @param {{ project_space_key: string, eligibility?: ReturnType<typeof readRehearsalEligibility> }} args
 */
export function filterWritersByRehearsalAllowlist(writers, { project_space_key, eligibility }) {
  if (!writers || typeof writers !== 'object') return {};
  const allowed = new Set(listAllowedWritersForSandbox({ project_space_key, eligibility }));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [sink, w] of Object.entries(writers)) {
    if (allowed.has(String(sink).toLowerCase())) out[sink] = w;
  }
  return out;
}

export default {
  DEFAULT_REHEARSAL_ELIGIBILITY_PATH,
  REHEARSAL_CLASSES,
  readRehearsalEligibility,
  isRehearsalSafeForProjectSpaceAndSink,
  hasAnySandboxSafeEntry,
  listAllowedWritersForSandbox,
  isProductionTarget,
  filterWritersByRehearsalAllowlist,
};
