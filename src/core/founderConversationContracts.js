const DIALOGUE_REQUIRED_KEYS = Object.freeze([
  'reframed_problem',
  'benchmark_axes',
  'mvp_scope_in',
  'mvp_scope_out',
  'risk_points',
  'key_questions',
  'pushback_point',
  'tradeoff_summary',
  'alternatives',
  'scope_cut',
  'next_step',
]);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export function validateDialogueContract(packet) {
  const missing = [];
  const p = packet || {};

  for (const key of DIALOGUE_REQUIRED_KEYS) {
    if (key === 'alternatives') {
      if (!isNonEmptyArray(p[key])) missing.push(key);
      continue;
    }
    if (key.endsWith('_axes') || key.endsWith('_in') || key.endsWith('_out') || key.endsWith('_points') || key === 'key_questions') {
      if (!isNonEmptyArray(p[key])) missing.push(key);
      continue;
    }
    if (!isNonEmptyString(p[key])) missing.push(key);
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function isForbiddenFounderFallbackIntent(intent) {
  return new Set([
    'runtime_meta',
    'meta_debug',
    'project_kickoff',
    'project_clarification',
    'project_status',
    'scope_lock_request',
    'approval_action',
    'deploy_linkage',
  ]).has(String(intent || ''));
}
