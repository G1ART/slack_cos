/**
 * Founder COS tool-call args — mechanical validation only.
 */

import { isValidToolAction } from './toolLaneActions.js';
import { validateDelegateHarnessTeamToolArgs } from '../delegateHarnessPacketValidate.js';
import { ALLOWED_EXTERNAL_TOOLS } from './cosFounderToolDefinitions.js';

/**
 * @param {string} callName
 * @param {Record<string, unknown>} args
 * @returns {{ blocked: boolean, reason?: string, machine_hint?: string, missing_required_fields?: string[] }}
 */
export function validateToolCallArgs(callName, args) {
  const a = args && typeof args === 'object' ? args : {};

  if (callName === 'delegate_harness_team') {
    return validateDelegateHarnessTeamToolArgs(a);
  }

  if (callName === 'invoke_external_tool') {
    const tool = a.tool;
    const action = String(a.action || '').trim();
    const payload = a.payload;
    if (!ALLOWED_EXTERNAL_TOOLS.has(tool)) return { blocked: true, reason: 'unsupported_tool' };
    if (!isValidToolAction(tool, action)) return { blocked: true, reason: 'unsupported_action' };
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { blocked: true, reason: 'invalid_payload' };
    }
    return { blocked: false };
  }

  if (callName === 'record_execution_note') {
    const note = a.note;
    if (typeof note !== 'string' || !note.trim()) return { blocked: true, reason: 'invalid_payload' };
    const d = a.detail;
    if (d !== undefined && d !== null && typeof d !== 'string') return { blocked: true, reason: 'invalid_payload' };
    return { blocked: false };
  }

  if (callName === 'read_execution_context') {
    const lim = a.limit;
    if (lim !== undefined && lim !== null && (typeof lim !== 'number' || lim < 1 || lim > 20)) {
      return { blocked: true, reason: 'invalid_payload' };
    }
    return { blocked: false };
  }

  return { blocked: false };
}
