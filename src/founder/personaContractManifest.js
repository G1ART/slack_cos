/**
 * G1 M2 — in-repo persona contract manifest (JSON). DB 이동·founder 봇 노출 비목표.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 레포 루트 기준 상대 경로 — COS 시스템 지시에 인용. */
export const PERSONA_CONTRACT_MANIFEST_REPO_PATH = 'src/founder/personaContracts.manifest.json';

const MANIFEST_ABS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'personaContracts.manifest.json');

const DELEGATE_PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

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
 * @param {unknown} m
 * @returns {string | null} 오류 코드 또는 null
 */
export function validatePersonaContractManifestShape(m) {
  if (!m || typeof m !== 'object') return 'root';
  if (typeof m.version !== 'string' || !String(m.version).trim()) return 'version';
  if (!Array.isArray(m.personas) || m.personas.length < 5) return 'personas_len';
  for (const p of m.personas) {
    if (!p || typeof p !== 'object') return 'persona_obj';
    if (typeof p.id !== 'string' || !String(p.id).trim()) return 'persona_id';
    const en = String(p.delegate_persona_enum || '').trim();
    if (!DELEGATE_PERSONA_ENUM.has(en)) return `delegate_enum:${en}`;
  }
  return null;
}
