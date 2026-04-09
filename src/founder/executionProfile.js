/**
 * vNext.13.57 — Single execution profile source of truth for adapter boundary (not scattered smoke gates).
 * Live-only/no-fallback threads get a narrow profile; default allows normal tool actions.
 */

import { isThreadLiveOnlyNoFallbackSmoke } from './delegateEmitPatchStash.js';

/** @typedef {'default' | 'live_only_emit_patch'} ExecutionProfileId */

/**
 * @typedef {{
 *   id: ExecutionProfileId,
 *   allowed_cursor_actions: string[],
 *   forbidden_cursor_actions: string[],
 *   side_effect_policy: 'git_branch_commit_push_secondary_evidence',
 *   callback_expectation: 'cos_webhook_primary_when_contract_enabled',
 * }} ExecutionProfile
 */

const DEFAULT_PROFILE = /** @type {ExecutionProfile} */ ({
  id: 'default',
  allowed_cursor_actions: ['create_spec', 'emit_patch'],
  forbidden_cursor_actions: [],
  side_effect_policy: 'git_branch_commit_push_secondary_evidence',
  callback_expectation: 'cos_webhook_primary_when_contract_enabled',
});

const LIVE_ONLY_EMIT_PATCH_PROFILE = /** @type {ExecutionProfile} */ ({
  id: 'live_only_emit_patch',
  allowed_cursor_actions: ['emit_patch'],
  forbidden_cursor_actions: ['create_spec'],
  side_effect_policy: 'git_branch_commit_push_secondary_evidence',
  callback_expectation: 'cos_webhook_primary_when_contract_enabled',
});

/**
 * @param {string | null | undefined} threadKey
 */
export function getExecutionProfileForThread(threadKey) {
  const tk = String(threadKey || '').trim();
  if (tk && isThreadLiveOnlyNoFallbackSmoke(tk)) return { ...LIVE_ONLY_EMIT_PATCH_PROFILE };
  return { ...DEFAULT_PROFILE };
}

/**
 * Policy evaluation at adapter boundary (not schema / not assembly).
 * @param {ExecutionProfile} profile
 * @param {string} action
 * @returns {{ ok: true } | { ok: false, code: string, detail: string }}
 */
export function evaluateCursorActionAgainstProfile(profile, action) {
  const a = String(action || '').trim();
  const forbidden = new Set(profile.forbidden_cursor_actions || []);
  if (forbidden.has(a)) {
    return {
      ok: false,
      code: 'execution_profile_policy_action_forbidden',
      detail:
        profile.id === 'live_only_emit_patch' && a === 'create_spec'
          ? 'create_spec forbidden under live_only_emit_patch profile (use emit_patch with narrow contract)'
          : `action ${a} forbidden by profile ${profile.id}`,
    };
  }
  const allowed = profile.allowed_cursor_actions || [];
  if (allowed.length && !allowed.includes(a)) {
    return {
      ok: false,
      code: 'execution_profile_policy_action_not_allowed',
      detail: `action ${a} not in allowed list for profile ${profile.id}`,
    };
  }
  return { ok: true };
}
