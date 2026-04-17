/**
 * W13-E — Harness Quality Proof Read Model (audit only, pure).
 *
 * Answers, from **already observed truth** (workcell runtimes / scenario envelopes /
 * human gate rows / run rows), whether the harness is measurably contributing to
 * quality, along 6 axes:
 *
 *   1. review_intervention_count            — 리뷰/리스크 스텝이 실제로 지적을 남긴 세션 수
 *   2. rework_loop_count                    — rework_cause_code 가 있는 세션 수
 *   3. blocked_before_false_completion_count — scenario envelope 가 broken 인데 블로킹/리뷰가 먼저 붙어
 *                                             false completion 을 막은 건수
 *   4. human_gate_reopen_coherence_count    — reopened_count>0 이면서 continuation 키와 resume_target 이 함께 존재
 *   5. artifact_to_live_mismatch_count      — scenario envelope 가 broken 인데 delivery_ready 를 주장한 건수
 *   6. run_outcome_by_team_shape            — { team_shape: { success, partial_success, failed, other } } 히스토그램
 *
 * Evidence-absent policy (IMPORTANT): 각 축은 기저 증거가 전혀 없으면 null 을 반환하고,
 * `toQualityProofCompactLines` 는 해당 라인을 생략한다. 수치 가짜 정밀(fake numeric precision)
 * 금지 — 모든 비율은 명시적 분자/분모로 반환한다.
 *
 * 본 모듈은 **pure**. 디스크/Supabase/Slack 호출을 하지 않는다.
 */

/**
 * @typedef {Object} HarnessWorkcellSessionProof
 * @property {number | null} [reviewer_findings_count]
 * @property {string | null} [rework_cause_code]
 * @property {string | null} [acceptance_evidence_kind]
 * @property {number | null} [unresolved_disagreements]
 */

/**
 * @typedef {Object} ScenarioProofEnvelopeSlim
 * @property {string} [scenario_id]
 * @property {'success' | 'partial_success' | 'broken' | 'failed' | string} [outcome]
 * @property {boolean} [delivery_ready]
 * @property {string} [break_location]
 * @property {string} [resolution_class]
 */

/**
 * @typedef {Object} HumanGateRowSlim
 * @property {string} id
 * @property {number} [reopened_count]
 * @property {string | null} [continuation_packet_id]
 * @property {string | null} [continuation_run_id]
 * @property {string | null} [continuation_thread_key]
 * @property {string | null} [resume_target_kind]
 * @property {string | null} [resume_target_ref]
 */

/**
 * @typedef {Object} RunRowSlim
 * @property {string} run_id
 * @property {'success'|'partial_success'|'failed'|string} [outcome]
 * @property {string | null} [team_shape]
 * @property {string | null} [resolution_class]
 */

/**
 * @typedef {Object} HarnessQualityProofInput
 * @property {HarnessWorkcellSessionProof[]} [workcell_sessions]
 * @property {ScenarioProofEnvelopeSlim[]} [scenario_envelopes]
 * @property {HumanGateRowSlim[]} [human_gate_rows]
 * @property {RunRowSlim[]} [run_rows]
 */

/**
 * @typedef {Object} HarnessQualityProofAxis
 * @property {number | null} value
 * @property {number} sample_size
 * @property {string | null} evidence_note
 */

/**
 * @typedef {Object} HarnessQualityProofReadModel
 * @property {HarnessQualityProofAxis} review_intervention
 * @property {HarnessQualityProofAxis} rework_loop
 * @property {HarnessQualityProofAxis} blocked_before_false_completion
 * @property {HarnessQualityProofAxis} human_gate_reopen_coherence
 * @property {HarnessQualityProofAxis} artifact_to_live_mismatch
 * @property {{ histogram: Record<string, { success: number, partial_success: number, failed: number, other: number }>, sample_size: number }} run_outcome_by_team_shape
 * @property {string} evidence_grade  (one of 'none' | 'weak' | 'sufficient')
 */

/** @type {readonly string[]} */
export const HARNESS_QUALITY_PROOF_AXES = Object.freeze([
  'review_intervention_count',
  'rework_loop_count',
  'blocked_before_false_completion_count',
  'human_gate_reopen_coherence_count',
  'artifact_to_live_mismatch_count',
  'run_outcome_by_team_shape',
]);

const ABSENT_EVIDENCE = Object.freeze({ value: null, sample_size: 0, evidence_note: null });

/**
 * @param {HarnessQualityProofInput} input
 * @returns {HarnessQualityProofReadModel}
 */
export function buildHarnessQualityProofReadModel(input) {
  const wc = Array.isArray(input?.workcell_sessions) ? input.workcell_sessions.filter(Boolean) : [];
  const envs = Array.isArray(input?.scenario_envelopes) ? input.scenario_envelopes.filter(Boolean) : [];
  const gates = Array.isArray(input?.human_gate_rows) ? input.human_gate_rows.filter(Boolean) : [];
  const runs = Array.isArray(input?.run_rows) ? input.run_rows.filter(Boolean) : [];

  // 1. review_intervention — sessions with reviewer_findings_count>0
  const reviewIntervention = (() => {
    if (wc.length === 0) return { ...ABSENT_EVIDENCE };
    const count = wc.filter((s) => Number(s.reviewer_findings_count) > 0).length;
    return {
      value: count,
      sample_size: wc.length,
      evidence_note: `workcell_sessions=${wc.length}`,
    };
  })();

  // 2. rework_loop — sessions with rework_cause_code (non-empty string)
  const reworkLoop = (() => {
    if (wc.length === 0) return { ...ABSENT_EVIDENCE };
    const count = wc.filter(
      (s) => typeof s.rework_cause_code === 'string' && s.rework_cause_code.trim().length > 0,
    ).length;
    return {
      value: count,
      sample_size: wc.length,
      evidence_note: `workcell_sessions=${wc.length}`,
    };
  })();

  // 3. blocked_before_false_completion — broken scenario envelopes that had a rework/review signal
  const blockedBeforeFalse = (() => {
    if (envs.length === 0) return { ...ABSENT_EVIDENCE };
    const broken = envs.filter((e) => e && (e.outcome === 'broken' || e.outcome === 'failed'));
    if (broken.length === 0) return { value: 0, sample_size: envs.length, evidence_note: `scenario_envelopes=${envs.length}` };
    // Count how many broken envelopes co-occurred with workcell rework/review signal.
    const hadReviewSignal = wc.some(
      (s) =>
        Number(s.reviewer_findings_count) > 0 ||
        (typeof s.rework_cause_code === 'string' && s.rework_cause_code.trim().length > 0),
    );
    return {
      value: hadReviewSignal ? broken.length : 0,
      sample_size: envs.length,
      evidence_note: hadReviewSignal
        ? `broken_scenarios_with_review_signal`
        : `broken_scenarios=${broken.length} without review signal`,
    };
  })();

  // 4. human_gate_reopen_coherence — reopened>0 AND continuation ref AND resume_target both present
  const gateCoherence = (() => {
    if (gates.length === 0) return { ...ABSENT_EVIDENCE };
    let count = 0;
    let reopenedAny = 0;
    for (const g of gates) {
      const rn = Number(g.reopened_count) || 0;
      if (rn > 0) reopenedAny += 1;
      const hasCont = !!(g.continuation_packet_id || g.continuation_run_id || g.continuation_thread_key);
      const hasResume = !!(g.resume_target_kind && g.resume_target_ref);
      if (rn > 0 && hasCont && hasResume) count += 1;
    }
    return {
      value: reopenedAny === 0 ? null : count,
      sample_size: gates.length,
      evidence_note: reopenedAny === 0 ? 'no reopened gates observed' : `reopened_gates=${reopenedAny}`,
    };
  })();

  // 5. artifact_to_live_mismatch — scenario envelope broken AND delivery_ready=true
  const mismatch = (() => {
    if (envs.length === 0) return { ...ABSENT_EVIDENCE };
    const count = envs.filter(
      (e) => (e.outcome === 'broken' || e.outcome === 'failed') && e.delivery_ready === true,
    ).length;
    return {
      value: count,
      sample_size: envs.length,
      evidence_note: `scenario_envelopes=${envs.length}`,
    };
  })();

  // 6. run_outcome_by_team_shape
  const histogramByShape = (() => {
    const hist = /** @type {Record<string, {success:number, partial_success:number, failed:number, other:number}>} */ ({});
    for (const r of runs) {
      const shape = String(r.team_shape || '').trim() || 'unknown';
      if (!hist[shape]) hist[shape] = { success: 0, partial_success: 0, failed: 0, other: 0 };
      const o = String(r.outcome || '').trim().toLowerCase();
      if (o === 'success' || o === 'partial_success' || o === 'failed') hist[shape][o] += 1;
      else hist[shape].other += 1;
    }
    return { histogram: hist, sample_size: runs.length };
  })();

  const axisHasValue = (a) => a && a.value !== null && a.sample_size > 0;
  const signals = [
    axisHasValue(reviewIntervention),
    axisHasValue(reworkLoop),
    axisHasValue(blockedBeforeFalse),
    axisHasValue(gateCoherence),
    axisHasValue(mismatch),
    histogramByShape.sample_size > 0,
  ].filter(Boolean).length;
  const evidenceGrade = signals === 0 ? 'none' : signals <= 2 ? 'weak' : 'sufficient';

  return {
    review_intervention: reviewIntervention,
    rework_loop: reworkLoop,
    blocked_before_false_completion: blockedBeforeFalse,
    human_gate_reopen_coherence: gateCoherence,
    artifact_to_live_mismatch: mismatch,
    run_outcome_by_team_shape: histogramByShape,
    evidence_grade: evidenceGrade,
  };
}

/**
 * founder 본문에 써도 안전한 compact line 포맷. 내부 토큰·run_id·resolution_class 노출 금지.
 * 증거가 부족한 축은 라인을 생략한다. evidence_grade='none' 이면 빈 배열.
 *
 * @param {HarnessQualityProofReadModel} rm
 * @returns {string[]}
 */
export function toQualityProofCompactLines(rm) {
  if (!rm || rm.evidence_grade === 'none') return [];
  const out = [];
  const line = (axis, phrase) => {
    if (axis.value != null && axis.sample_size > 0) {
      out.push(`${phrase} (표본 ${axis.sample_size}건)`);
    }
  };
  line(rm.review_intervention, `리뷰 개입 ${rm.review_intervention.value}건`);
  line(rm.rework_loop, `리워크 루프 ${rm.rework_loop.value}건`);
  if (
    rm.blocked_before_false_completion.value != null &&
    rm.blocked_before_false_completion.value > 0
  ) {
    out.push(
      `허위 완료 차단 ${rm.blocked_before_false_completion.value}건 (표본 ${rm.blocked_before_false_completion.sample_size}건)`,
    );
  }
  if (rm.human_gate_reopen_coherence.value != null) {
    out.push(
      `재개 게이트 일관성 ${rm.human_gate_reopen_coherence.value}건 (표본 ${rm.human_gate_reopen_coherence.sample_size}건)`,
    );
  }
  if (
    rm.artifact_to_live_mismatch.value != null &&
    rm.artifact_to_live_mismatch.value > 0
  ) {
    out.push(
      `아티팩트·라이브 불일치 ${rm.artifact_to_live_mismatch.value}건 (표본 ${rm.artifact_to_live_mismatch.sample_size}건)`,
    );
  }
  if (rm.run_outcome_by_team_shape.sample_size > 0) {
    const parts = [];
    for (const [shape, hist] of Object.entries(rm.run_outcome_by_team_shape.histogram)) {
      const total = hist.success + hist.partial_success + hist.failed + hist.other;
      parts.push(`${shape} ${total}건`);
    }
    if (parts.length > 0) out.push(`팀 형태별 실행: ${parts.slice(0, 3).join(' · ')}`);
  }
  return out;
}
