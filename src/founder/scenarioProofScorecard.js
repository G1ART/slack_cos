/**
 * W9 — ScenarioProofScorecard.
 *
 * 여러 시나리오 러너 결과(Envelope + Classifier 출력) 를 aggregate 하여
 * pass/fail/inconclusive 카운트, 지배적 break_category, human-gate 요약을 뽑는다.
 * founder 본문엔 compact lines 만 흐른다 — envelope 전체는 audit-only.
 *
 * 본 모듈은 pure — store/fetch/Slack 호출 금지.
 */

import { classifyScenarioProofEnvelope, BREAK_CATEGORIES } from './scenarioProofResultClassifier.js';

/**
 * @typedef {Object} ScenarioProofScorecard
 * @property {number} total
 * @property {number} passed
 * @property {number} broken
 * @property {number} inconclusive
 * @property {number} human_gate_required
 * @property {number} continuation_available
 * @property {Record<string, number>} break_category_counts
 * @property {Array<{scenario_id: string, outcome: string, break_category: string, human_gate_required: boolean, headline: string|null}>} entries
 */

/**
 * @param {Array<import('../../scripts/scenario/scenarioProofEnvelope.js').ScenarioProofEnvelope>} envelopes
 * @returns {ScenarioProofScorecard}
 */
export function buildScenarioProofScorecard(envelopes) {
  const list = Array.isArray(envelopes) ? envelopes.filter(Boolean) : [];
  const counts = Object.fromEntries(BREAK_CATEGORIES.map((k) => [k, 0]));
  let passed = 0;
  let broken = 0;
  let inconclusive = 0;
  let hil = 0;
  let cont = 0;
  const entries = [];
  for (const env of list) {
    const c = classifyScenarioProofEnvelope(env);
    counts[c.break_category] = (counts[c.break_category] || 0) + 1;
    if (c.outcome === 'succeeded') passed += 1;
    else if (c.outcome === 'broken') broken += 1;
    else inconclusive += 1;
    if (c.human_gate_required) hil += 1;
    if (c.continuation_path_exists) cont += 1;
    entries.push({
      scenario_id: c.scenario_id,
      outcome: c.outcome,
      break_category: c.break_category,
      human_gate_required: c.human_gate_required,
      headline: c.headline,
    });
  }
  return {
    total: list.length,
    passed,
    broken,
    inconclusive,
    human_gate_required: hil,
    continuation_available: cont,
    break_category_counts: counts,
    entries,
  };
}

/**
 * Compact founder-facing lines. 내부 토큰/경로 금지 — 자연어 요약만.
 * @param {ScenarioProofScorecard} sc
 * @returns {string[]}
 */
export function toScorecardCompactLines(sc) {
  if (!sc || sc.total === 0) return [];
  const lines = [];
  lines.push(
    `시나리오 프루프 ${sc.total}건 · 성공 ${sc.passed} · 중단 ${sc.broken} · 미결 ${sc.inconclusive}`,
  );
  if (sc.human_gate_required > 0) {
    lines.push(`사람 승인 필요 ${sc.human_gate_required}건 · 이어받기 경로 ${sc.continuation_available}건`);
  }
  const dominant = Object.entries(sc.break_category_counts || {})
    .filter(([k, v]) => k !== 'none' && v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (dominant) {
    lines.push(`가장 잦은 중단 영역: ${humanizeBreakCategory(dominant[0])} (${dominant[1]}건)`);
  }
  return lines;
}

function humanizeBreakCategory(cat) {
  switch (cat) {
    case 'adapter':
      return '툴 어댑터';
    case 'policy':
      return '정책';
    case 'model':
      return '모델 협조';
    case 'runtime':
      return '런타임';
    case 'human':
      return '사람 승인';
    case 'unclassified':
      return '미분류';
    default:
      return cat;
  }
}
