/**
 * M2b — 승인 매트릭스·정책 v1 (차원 → 티어).
 * 출력만: auto_allowed | cos_approval_only | executive_approval_required
 * @see COS_Project_Directive_NorthStar_FastTrack_v1.md §5.4
 * @see COS_NorthStar_Implementation_Pathway_Harness_2026-03.md §11.3
 */

/**
 * @typedef {{
 *   action_type: string,
 *   environment_key?: string,
 *   env_profile_risk?: string,
 *   selected_option?: { option_id?: string, risk_level?: string, reversibility?: string, estimated_cost?: string } | null,
 * }} ApprovalMatrixInput
 */

/**
 * @param {string | undefined} s
 * @returns {boolean}
 */
function isLowReversibility(s) {
  const t = String(s || '').toLowerCase();
  return /낮|low|irrevers|되돌리기\s*어렵|되돌리기\s*낮/i.test(t);
}

/**
 * @param {string | undefined} s
 * @returns {boolean}
 */
function isHighCostBand(s) {
  const t = String(s || '').toLowerCase();
  return /상|최고|매우\s*높|very\s*high|very_high|high\s*cost/i.test(t);
}

/**
 * @param {ApprovalMatrixInput} [ctx]
 * @returns {{
 *   tier: 'auto_allowed'|'cos_approval_only'|'executive_approval_required',
 *   note: string,
 *   dimensions_summary?: string,
 *   escalation_reasons?: string[] | null,
 * }}
 */
export function evaluateApprovalPolicy(ctx = {}) {
  const action = String(ctx.action_type || '');
  const envKey = String(ctx.environment_key || 'dev').toLowerCase();
  const profileRisk = String(ctx.env_profile_risk || 'low').toLowerCase();

  if (action === 'customer_feedback_intake') {
    /** 고객 피드백 → AWQ 초안: 옵션 신호 없음 — 환경·프로필 risk만으로 COS(v1) 티어. */
    /** @type {string[]} */
    const reasons = [];
    if (envKey === 'prod') reasons.push('environment=prod');
    if (profileRisk === 'high') reasons.push('env_profile_risk=high');
    const executive = reasons.length > 0;
    const tier = executive ? 'executive_approval_required' : 'cos_approval_only';
    const note = executive
      ? `대표 승인 게이트(피드백 초안 AWQ) — ${reasons.join('; ')}`
      : 'COS 게이트·queued — 피드백에서 생성된 초안(비 prod·프로필 온건).';
    return {
      tier,
      note,
      dimensions_summary: `action=customer_feedback_intake env=${envKey}`,
      escalation_reasons: executive ? reasons : null,
    };
  }

  if (action === 'decision_defer') {
    return {
      tier: 'auto_allowed',
      note: '보류 — 외부 집행·고객 노출 없음; 기록·맥락만 유지.',
      dimensions_summary: `action=defer env=${envKey}`,
      escalation_reasons: null,
    };
  }

  if (action === 'decision_pick') {
    const opt = ctx.selected_option || null;
    /** @type {string[]} */
    const reasons = [];

    if (envKey === 'prod') {
      reasons.push('environment=prod');
    }
    if (profileRisk === 'high') {
      reasons.push('env_profile_risk=high');
    }
    if (opt && String(opt.risk_level || '').toLowerCase() === 'high') {
      reasons.push('option_risk_level=high');
    }
    if (opt && isLowReversibility(opt.reversibility)) {
      reasons.push('reversibility=low');
    }
    if (opt && isHighCostBand(opt.estimated_cost)) {
      reasons.push('estimated_cost=high_band');
    }

    const executive = reasons.length > 0;
    const tier = executive ? 'executive_approval_required' : 'cos_approval_only';
    const note = executive
      ? `대표(또는 위임) 승인 후 실행·연결 권장 — 근거: ${reasons.join('; ')}`
      : 'COS 내부 확인·워크 연결로 진행 (티어 v1·운영 환경·선택지 신호가 온건함).';

    return {
      tier,
      note,
      dimensions_summary: `action=pick env=${envKey} opt=${opt?.option_id ?? '—'}`,
      escalation_reasons: executive ? reasons : null,
    };
  }

  return {
    tier: 'cos_approval_only',
    note: '알 수 없는 action_type — 기본 COS 게이트 (v1).',
    dimensions_summary: `action=${action || 'unknown'} env=${envKey}`,
    escalation_reasons: null,
  };
}

/** @deprecated 이름 호환 — `evaluateApprovalPolicy` 와 동일 */
export function evaluateThinApprovalMatrix(ctx) {
  return evaluateApprovalPolicy(ctx);
}
