/**
 * OpenAI strict schema audit helpers for COS_TOOLS (CI / regression).
 */

import { COS_TOOLS } from './cosFounderToolDefinitions.js';

/**
 * OpenAI Responses `strict: true` 도구 스키마: 각 object 노드에서 properties 키 전부가 required에 있어야 함.
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @returns {string[]}
 */
export function collectOpenAiStrictSchemaViolations(schema, path = 'root') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return [];
  const out = [];
  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const keys = Object.keys(schema.properties);
    if (keys.length > 0 && schema.additionalProperties !== false) {
      out.push(`${path}: object with properties must set additionalProperties: false (OpenAI strict)`);
    }
    const req = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const k of keys) {
      if (!req.has(k)) out.push(`${path}: missing "${k}" in required (OpenAI strict)`);
    }
    for (const k of keys) {
      const child = schema.properties[k];
      out.push(...collectOpenAiStrictSchemaViolations(child, `${path}.${k}`));
    }
  }
  if (schema.items) {
    out.push(...collectOpenAiStrictSchemaViolations(schema.items, `${path}[items]`));
  }
  if (Array.isArray(schema.anyOf)) {
    for (let i = 0; i < schema.anyOf.length; i += 1) {
      const branch = schema.anyOf[i];
      if (branch && typeof branch === 'object' && branch.type === 'null') continue;
      out.push(...collectOpenAiStrictSchemaViolations(branch, `${path}.anyOf[${i}]`));
    }
  }
  return out;
}

/** strict:true 인 COS_TOOLS만 검사 — CI·회귀용 */
export function getOpenAiStrictViolationsForCosTools() {
  const errs = [];
  for (const t of COS_TOOLS) {
    if (t.type !== 'function' || !t.strict || !t.parameters) continue;
    errs.push(...collectOpenAiStrictSchemaViolations(t.parameters, `tool:${t.name}.parameters`));
  }
  return errs;
}

/** @returns {Record<string, unknown> | null} */
export function getDelegateHarnessTeamParametersSnapshot() {
  const t = COS_TOOLS.find((x) => x.type === 'function' && x.name === 'delegate_harness_team');
  return t && t.parameters && typeof t.parameters === 'object' ? t.parameters : null;
}

/**
 * Boot log helper — same keys as app.js `cos_boot_delegate_schema` (without deploy_sha).
 */
export function getDelegateBootSchemaSnapshot() {
  const dhProps = getDelegateHarnessTeamParametersSnapshot()?.properties;
  const delegateKeys =
    dhProps && typeof dhProps === 'object' && !Array.isArray(dhProps) ? Object.keys(dhProps).sort() : [];
  return {
    delegate_parameter_keys: delegateKeys,
    delegate_schema_includes_packets: delegateKeys.includes('packets'),
  };
}
