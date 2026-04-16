/**
 * W10-B — Harness Proof Scorecard (audit only).
 *
 * 여러 workcell runtime 결과(또는 ledger 에 누적된 하네스 실행 세션) 의 W6-B proof 필드들
 * (`reviewer_findings_count` / `rework_cause_code` / `acceptance_evidence_kind` /
 * `unresolved_disagreements` / `correction_hit_rate` / `patch_quality_delta`)을 aggregate 하여
 * Harness 가 실제로 quality 에 기여하는지의 점수판을 만든다.
 *
 * 본 모듈은 **pure**. 디스크/Supabase/Slack 호출을 하지 않으며, founder 본문에는 compact lines 만 간다.
 * 원시 필드는 `audit` 섹션에만 남고, founder 표면엔 수치·범위·비율 등 자연어만 노출된다.
 */

/** @type {readonly string[]} */
export const HARNESS_PROOF_SCORECARD_KINDS = Object.freeze([
  'reviewer_rework_load',
  'acceptance_coverage',
  'unresolved_disagreement_load',
  'correction_hit_rate_mean',
  'patch_quality_delta_mean',
]);

/**
 * @typedef {Object} HarnessProofSession
 * @property {number | null} [reviewer_findings_count]
 * @property {string | null} [rework_cause_code]
 * @property {string | null} [acceptance_evidence_kind]
 * @property {number | null} [unresolved_disagreements]
 * @property {number | null} [correction_hit_rate]
 * @property {number | null} [patch_quality_delta]
 */

/**
 * @typedef {Object} HarnessProofScorecard
 * @property {number} session_count
 * @property {number} reviewer_findings_total
 * @property {number} unresolved_disagreements_total
 * @property {number} sessions_with_rework
 * @property {Record<string, number>} rework_cause_histogram
 * @property {Record<string, number>} acceptance_evidence_histogram
 * @property {number | null} correction_hit_rate_mean
 * @property {number | null} patch_quality_delta_mean
 * @property {number | null} acceptance_coverage_ratio
 * @property {{ kind: string, value: string, count: number } | null} top_rework_cause
 */

/**
 * @param {HarnessProofSession[]} sessions
 * @returns {HarnessProofScorecard}
 */
export function buildHarnessProofScorecard(sessions) {
  const list = Array.isArray(sessions) ? sessions.filter((s) => s && typeof s === 'object') : [];
  let findings = 0;
  let unresolved = 0;
  let withRework = 0;
  let withAcceptance = 0;
  const reworkHist = /** @type {Record<string, number>} */ ({});
  const acceptanceHist = /** @type {Record<string, number>} */ ({});
  let chrSum = 0;
  let chrCount = 0;
  let pqdSum = 0;
  let pqdCount = 0;

  for (const s of list) {
    const rfc = Number(s.reviewer_findings_count);
    if (Number.isFinite(rfc) && rfc >= 0) findings += rfc;
    const ud = Number(s.unresolved_disagreements);
    if (Number.isFinite(ud) && ud >= 0) unresolved += ud;
    const rc = typeof s.rework_cause_code === 'string' ? s.rework_cause_code.trim().toLowerCase() : '';
    if (rc) {
      reworkHist[rc] = (reworkHist[rc] || 0) + 1;
      withRework += 1;
    }
    const ae = typeof s.acceptance_evidence_kind === 'string' ? s.acceptance_evidence_kind.trim().toLowerCase() : '';
    if (ae) {
      acceptanceHist[ae] = (acceptanceHist[ae] || 0) + 1;
      withAcceptance += 1;
    }
    const chr = Number(s.correction_hit_rate);
    if (Number.isFinite(chr) && chr >= 0 && chr <= 1) {
      chrSum += chr;
      chrCount += 1;
    }
    const pqd = Number(s.patch_quality_delta);
    if (Number.isFinite(pqd)) {
      pqdSum += pqd;
      pqdCount += 1;
    }
  }

  const chrMean = chrCount > 0 ? round(chrSum / chrCount, 4) : null;
  const pqdMean = pqdCount > 0 ? round(pqdSum / pqdCount, 4) : null;
  const acceptanceCoverage = list.length > 0 ? round(withAcceptance / list.length, 4) : null;
  const topRework = pickTop(reworkHist);

  return {
    session_count: list.length,
    reviewer_findings_total: findings,
    unresolved_disagreements_total: unresolved,
    sessions_with_rework: withRework,
    rework_cause_histogram: reworkHist,
    acceptance_evidence_histogram: acceptanceHist,
    correction_hit_rate_mean: chrMean,
    patch_quality_delta_mean: pqdMean,
    acceptance_coverage_ratio: acceptanceCoverage,
    top_rework_cause: topRework ? { kind: 'rework_cause', value: topRework.key, count: topRework.count } : null,
  };
}

/**
 * founder 본문/read_execution_context 에 들어갈 compact 자연어 라인.
 * 내부 토큰·resolution_class·run_id 등을 넣지 않는다.
 *
 * @param {HarnessProofScorecard} sc
 * @returns {string[]}
 */
export function toHarnessProofCompactLines(sc) {
  if (!sc || sc.session_count === 0) return [];
  const out = [];
  out.push(
    `하네스 세션 ${sc.session_count}건 · 리뷰 지적 ${sc.reviewer_findings_total}개 · 미결 불일치 ${sc.unresolved_disagreements_total}건`,
  );
  if (sc.sessions_with_rework > 0 && sc.top_rework_cause) {
    out.push(
      `리워크 ${sc.sessions_with_rework}건 · 가장 잦은 원인: ${humanizeReworkCause(sc.top_rework_cause.value)} (${sc.top_rework_cause.count}건)`,
    );
  }
  if (sc.acceptance_coverage_ratio != null) {
    out.push(`수용 증거 기재율 ${formatPercent(sc.acceptance_coverage_ratio)} (${describeAcceptanceMix(sc.acceptance_evidence_histogram)})`);
  }
  if (sc.correction_hit_rate_mean != null) {
    out.push(`교정 적중률 평균 ${formatPercent(sc.correction_hit_rate_mean)}`);
  }
  if (sc.patch_quality_delta_mean != null) {
    out.push(`패치 품질 변화 평균 ${sc.patch_quality_delta_mean >= 0 ? '+' : ''}${sc.patch_quality_delta_mean}`);
  }
  return out;
}

function pickTop(hist) {
  let best = null;
  for (const [k, v] of Object.entries(hist)) {
    if (!best || v > best.count) best = { key: k, count: v };
  }
  return best;
}

function humanizeReworkCause(code) {
  switch (code) {
    case 'reviewer_finding':
      return '리뷰 지적';
    case 'disagreement_unresolved':
      return '미결 불일치';
    case 'external_regression':
      return '외부 회귀';
    case 'unclear_spec':
      return '사양 불명확';
    case 'other':
      return '기타';
    default:
      return code;
  }
}

function describeAcceptanceMix(hist) {
  const entries = Object.entries(hist || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '수용 증거 없음';
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${humanizeAcceptance(k)} ${v}`)
    .join(' · ');
}

function humanizeAcceptance(k) {
  switch (k) {
    case 'artifact_diff':
      return '아티팩트 차이';
    case 'test_pass':
      return '테스트 통과';
    case 'reviewer_sign_off':
      return '리뷰 승인';
    case 'live_demo':
      return '라이브 시연';
    case 'bundle_attached':
      return '번들 첨부';
    default:
      return k;
  }
}

function formatPercent(n) {
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n * 1000) / 10}%`;
}

function round(n, digits = 4) {
  if (!Number.isFinite(n)) return null;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}
