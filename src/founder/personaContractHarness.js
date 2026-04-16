/**
 * Persona contract fail-closed checks for delegate_harness_team (W2-A).
 */

import { loadPersonaContractManifest, validatePersonaContractManifestShape } from './personaContractManifest.js';
import { isValidToolAction } from './toolPlane/toolLaneActions.js';

const PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/**
 * @param {Record<string, unknown>} extra
 */
function contractBlocked(extra) {
  return {
    blocked: true,
    reason: 'invalid_payload',
    delegate_schema_valid: false,
    ...extra,
  };
}

/**
 * OpenAI tool args 또는 runHarnessOrchestration 정규화 후 payload에 대해 계약 검증.
 * @param {Record<string, unknown>} args
 * @returns {{ blocked: false, delegate_schema_valid: true } | Record<string, unknown>}
 */
export function validatePersonaContractHarnessEnvelope(args) {
  const a = args && typeof args === 'object' ? args : {};
  const objective = typeof a.objective === 'string' ? a.objective.trim() : '';
  const rawPersonas = Array.isArray(a.personas) ? a.personas : [];
  const personas = [
    ...new Set(
      rawPersonas.map((x) => String(x).toLowerCase().trim()).filter((x) => PERSONA_ENUM.has(x)),
    ),
  ];
  const plist = personas.length ? personas : objective ? ['pm'] : [];
  if (!plist.length) return { blocked: false, delegate_schema_valid: true };

  let m;
  try {
    m = loadPersonaContractManifest();
  } catch {
    return contractBlocked({
      blocked_reason: 'persona_contract_manifest_unreadable',
      machine_hint: 'persona contract manifest could not be read',
      delegate_schema_error_fields: ['persona_contract'],
    });
  }
  const shapeErr = validatePersonaContractManifestShape(m);
  if (shapeErr) {
    return contractBlocked({
      blocked_reason: 'persona_contract_manifest_invalid',
      machine_hint: String(shapeErr).slice(0, 160),
      delegate_schema_error_fields: ['persona_contract'],
    });
  }

  const byEnum = new Map(
    (Array.isArray(m.personas) ? m.personas : []).map((row) => {
      const en = String(row.delegate_persona_enum || '').trim().toLowerCase();
      return [en, row];
    }),
  );

  for (const persona of plist) {
    if (!byEnum.has(persona)) {
      return contractBlocked({
        blocked_reason: 'persona_contract_missing_for_persona',
        machine_hint: `no manifest row for delegate persona ${persona}`,
        delegate_schema_error_fields: [`personas:${persona}`],
      });
    }
  }

  if (a.packets != null && Array.isArray(a.packets)) {
    for (let i = 0; i < a.packets.length; i += 1) {
      const pkt = a.packets[i];
      if (!pkt || typeof pkt !== 'object' || Array.isArray(pkt)) continue;
      const pen = String(pkt.persona || '').toLowerCase().trim();
      if (!pen || !PERSONA_ENUM.has(pen)) continue;
      const row = byEnum.get(pen);
      if (!row || typeof row !== 'object') {
        return contractBlocked({
          blocked_reason: 'persona_contract_packet_persona_unknown',
          machine_hint: `packets[${i}].persona has no manifest row`,
          delegate_schema_error_fields: [`packets[${i}].persona`],
        });
      }
      const allowed_tools = new Set(
        (Array.isArray(row.allowed_tools) ? row.allowed_tools : []).map((x) => String(x).trim()),
      );
      const allowed_actions = new Set(
        (Array.isArray(row.allowed_actions) ? row.allowed_actions : []).map((x) => String(x).trim()),
      );
      const ptRaw = pkt.preferred_tool != null ? String(pkt.preferred_tool).trim() : '';
      const paRaw = pkt.preferred_action != null ? String(pkt.preferred_action).trim() : '';
      if (ptRaw && !allowed_tools.has(ptRaw)) {
        return contractBlocked({
          blocked_reason: 'persona_contract_tool_not_allowed',
          machine_hint: `packets[${i}].preferred_tool not allowed for ${pen}`,
          delegate_schema_error_fields: [`packets[${i}].preferred_tool`],
        });
      }
      if (paRaw && !allowed_actions.has(paRaw)) {
        return contractBlocked({
          blocked_reason: 'persona_contract_action_not_allowed',
          machine_hint: `packets[${i}].preferred_action not allowed for ${pen}`,
          delegate_schema_error_fields: [`packets[${i}].preferred_action`],
        });
      }
      if (ptRaw && paRaw && !isValidToolAction(ptRaw, paRaw)) {
        return contractBlocked({
          blocked_reason: 'persona_contract_tool_action_mismatch',
          machine_hint: `packets[${i}] tool/action pair invalid for runtime`,
          delegate_schema_error_fields: [`packets[${i}].preferred_tool`, `packets[${i}].preferred_action`],
        });
      }
    }
  }

  return { blocked: false, delegate_schema_valid: true };
}

/**
 * @param {{ objective?: string, personas: string[], packets?: object[] }} p
 */
export function validatePersonaContractHarnessDispatch(p) {
  const payload = p && typeof p === 'object' ? p : {};
  return validatePersonaContractHarnessEnvelope({
    objective: payload.objective,
    personas: payload.personas,
    packets: payload.packets,
  });
}
