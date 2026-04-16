/**
 * G1 M2 — in-repo persona contract manifest (JSON). DB 이동·founder 봇 노출 비목표.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ALL_EXTERNAL_TOOLS, isValidToolAction } from './toolPlane/toolLaneActions.js';

/** 레포 루트 기준 상대 경로 — COS 시스템 지시에 인용. */
export const PERSONA_CONTRACT_MANIFEST_REPO_PATH = 'src/founder/personaContracts.manifest.json';

const MANIFEST_ABS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'personaContracts.manifest.json');

const DELEGATE_PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

const REQUIRED_OUTPUT_MODES = new Set(['artifact_first', 'live_when_ready', 'artifact_only']);
const REVIEW_DUTIES = new Set(['none', 'advisory', 'blocking']);
const ESCALATION_PREDS = new Set(['contract_miss', 'live_unavailable', 'tenancy_ambiguous']);
const SCHEMA_KINDS = new Set(['delegate_packet_v1']);
const SCHEMA_MIN_FIELDS = new Set(['persona', 'mission', 'packet_id', 'preferred_tool', 'preferred_action']);

/**
 * @returns {{ version: string, description?: string, personas: object[] }}
 */
export function loadPersonaContractManifest() {
  const raw = readFileSync(MANIFEST_ABS, 'utf8');
  const j = JSON.parse(raw);
  if (!j || typeof j !== 'object') throw new Error('persona_contract_manifest_invalid_root');
  return j;
}

/**
 * @param {unknown} row
 * @param {string} ctx
 * @returns {string | null}
 */
function validatePersonaExecutionRow(row, ctx) {
  if (!row || typeof row !== 'object') return `${ctx}:obj`;
  const allowed_actions = row.allowed_actions;
  const allowed_tools = row.allowed_tools;
  if (!Array.isArray(allowed_actions) || allowed_actions.length === 0) return `${ctx}:allowed_actions`;
  if (!Array.isArray(allowed_tools) || allowed_tools.length === 0) return `${ctx}:allowed_tools`;
  const tools = new Set();
  for (const t of allowed_tools) {
    const ts = String(t || '').trim();
    if (!ALL_EXTERNAL_TOOLS.has(ts)) return `${ctx}:tool:${ts}`;
    tools.add(ts);
  }
  for (const a of allowed_actions) {
    const act = String(a || '').trim();
    if (!act) return `${ctx}:action_empty`;
    let okForSomeTool = false;
    for (const tool of tools) {
      if (isValidToolAction(tool, act)) {
        okForSomeTool = true;
        break;
      }
    }
    if (!okForSomeTool) return `${ctx}:action:${act}`;
  }
  const mode = String(row.required_output_mode || '').trim();
  if (!REQUIRED_OUTPUT_MODES.has(mode)) return `${ctx}:required_output_mode`;
  const schema = row.required_output_schema;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return `${ctx}:required_output_schema`;
  const kind = String(schema.kind || '').trim();
  if (!SCHEMA_KINDS.has(kind)) return `${ctx}:schema_kind`;
  if (!Array.isArray(schema.min_fields) || schema.min_fields.length === 0) return `${ctx}:min_fields`;
  for (const f of schema.min_fields) {
    if (!SCHEMA_MIN_FIELDS.has(String(f || '').trim())) return `${ctx}:min_field:${f}`;
  }
  const duty = String(row.review_duty || '').trim();
  if (!REVIEW_DUTIES.has(duty)) return `${ctx}:review_duty`;
  const ep = row.escalation_predicates;
  if (!Array.isArray(ep) || ep.length === 0) return `${ctx}:escalation_predicates`;
  for (const e of ep) {
    if (!ESCALATION_PREDS.has(String(e || '').trim())) return `${ctx}:escalation:${e}`;
  }
  return null;
}

/**
 * @param {unknown} m
 * @returns {string | null} 오류 코드 또는 null
 */
export function validatePersonaContractManifestShape(m) {
  if (!m || typeof m !== 'object') return 'root';
  if (typeof m.version !== 'string' || !String(m.version).trim()) return 'version';
  if (!Array.isArray(m.personas) || m.personas.length < 5) return 'personas_len';
  const seenEnums = new Set();
  for (const p of m.personas) {
    if (!p || typeof p !== 'object') return 'persona_obj';
    if (typeof p.id !== 'string' || !String(p.id).trim()) return 'persona_id';
    const en = String(p.delegate_persona_enum || '').trim();
    if (!DELEGATE_PERSONA_ENUM.has(en)) return `delegate_enum:${en}`;
    if (seenEnums.has(en)) return `delegate_enum_dup:${en}`;
    seenEnums.add(en);
    const rowErr = validatePersonaExecutionRow(p, `persona:${en}`);
    if (rowErr) return rowErr;
  }
  for (const need of DELEGATE_PERSONA_ENUM) {
    if (!seenEnums.has(need)) return `missing_delegate_enum:${need}`;
  }
  return null;
}

/**
 * @param {string} delegateEnum
 * @returns {Record<string, unknown> | null}
 */
export function getPersonaContractRowByDelegateEnum(delegateEnum) {
  const en = String(delegateEnum || '').trim().toLowerCase();
  if (!en) return null;
  let m;
  try {
    m = loadPersonaContractManifest();
  } catch {
    return null;
  }
  if (validatePersonaContractManifestShape(m) !== null) return null;
  const row = m.personas.find((p) => String(p.delegate_persona_enum || '').trim().toLowerCase() === en);
  return row && typeof row === 'object' ? /** @type {Record<string, unknown>} */ (row) : null;
}

/**
 * 런타임·감사용 컴팩트 스냅샷 (줄 단위, 길이 상한).
 * @param {string[]} delegateEnums
 * @param {number} [maxLines]
 * @returns {string[]}
 */
export function formatPersonaContractRuntimeSnapshotLines(delegateEnums, maxLines = 12) {
  try {
    const m = loadPersonaContractManifest();
    if (validatePersonaContractManifestShape(m) !== null) return [];
    const want = new Set(
      (Array.isArray(delegateEnums) ? delegateEnums : []).map((x) => String(x || '').trim().toLowerCase()).filter(Boolean),
    );
    const lines = [];
    for (const p of m.personas) {
      const en = String(p.delegate_persona_enum || '').trim().toLowerCase();
      if (want.size && !want.has(en)) continue;
      const id = String(p.id || '').trim();
      const tools = Array.isArray(p.allowed_tools) ? p.allowed_tools.map(String).join(',') : '';
      const acts = Array.isArray(p.allowed_actions) ? p.allowed_actions.map(String).join(',') : '';
      const mode = String(p.required_output_mode || '').trim();
      const duty = String(p.review_duty || '').trim();
      lines.push(
        `${en}|${id}|v${String(m.version || '').trim()}|mode=${mode}|duty=${duty}|tools=${tools}|actions=${acts}`.slice(
          0,
          400,
        ),
      );
      if (lines.length >= maxLines) break;
    }
    return lines;
  } catch {
    return [];
  }
}

/**
 * COS 시스템 지시용 — 한글 한 줄씩, 길이 상한만 기계 적용 (의미 해석 없음).
 * @param {number} [maxChars]
 * @returns {string} 빈 문자열이면 생략 가능
 */
export function formatPersonaContractLinesForInstructions(maxChars = 1400) {
  try {
    const m = loadPersonaContractManifest();
    const err = validatePersonaContractManifestShape(m);
    if (err) return '';
    const lines = [];
    lines.push(`[페르소나 계약 manifest v${String(m.version).trim()} — id→delegate enum]`);
    for (const p of m.personas) {
      const id = String(p.id || '').trim();
      const en = String(p.delegate_persona_enum || '').trim();
      const r = String(p.review_responsibility_ko || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      lines.push(`- ${id}→${en}: ${r}`);
    }
    let s = lines.join('\n');
    if (s.length > maxChars) s = `${s.slice(0, maxChars - 3)}...`;
    return s;
  } catch {
    return '';
  }
}
