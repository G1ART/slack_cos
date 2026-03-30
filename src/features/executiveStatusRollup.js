/**
 * M2b — 운영 스냅샷: 워크큐·계획·업무 JSON 스토어 → 상태 패킷 필드.
 * LLM 없음. Supabase dual-write와 수치가 어긋날 수 있음(로컬 파일·코어 스토어 기준).
 */

import { getStoreCore } from '../storage/core/index.js';
import { readJsonArray } from '../storage/jsonStore.js';
import { resolveAgentWorkQueuePath, resolveCosWorkspaceQueuePath } from '../storage/paths.js';

/**
 * @template T
 * @param {T[]} arr
 * @param {(x: T) => string | null} keyFn
 */
function countBy(arr, keyFn) {
  /** @type Map<string, number> */
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * @param {Map<string, number>} map
 */
function formatCountMap(map) {
  return [...map.entries()]
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([k, v]) => `${k}:${v}`)
    .join(' · ') || '—';
}

/**
 * @returns {Promise<{
 *   progress_change: string,
 *   current_blockers: string[],
 *   decisions_needed: string[],
 *   cos_next_action: string[],
 *   proof_refs: string[],
 *   has_operating_data: boolean,
 * }>}
 */
export async function gatherExecutiveOperatingRollup() {
  let awq = [];
  try {
    awq = await readJsonArray(resolveAgentWorkQueuePath());
  } catch {
    awq = [];
  }
  if (!Array.isArray(awq)) awq = [];

  let plans = [];
  try {
    plans = await getStoreCore().list('plans');
  } catch {
    plans = [];
  }
  if (!Array.isArray(plans)) plans = [];

  let works = [];
  try {
    works = await getStoreCore().list('work_items');
  } catch {
    works = [];
  }
  if (!Array.isArray(works)) works = [];

  let cws = [];
  try {
    cws = await readJsonArray(resolveCosWorkspaceQueuePath());
  } catch {
    cws = [];
  }
  if (!Array.isArray(cws)) cws = [];
  const cwsSpec = cws.filter(
    /** @param {any} x */ (x) => x && x.kind === 'spec_intake',
  );
  const cwsFb = cws.filter(
    /** @param {any} x */ (x) => x && x.kind === 'customer_feedback',
  );
  const cwsBy = countBy(
    cwsSpec,
    /** @param {any} r */ (r) => (r.status ? String(r.status) : null),
  );
  const cwsLine = `실행 큐 (CWS·spec): ${formatCountMap(cwsBy)}`;
  const cfbBy = countBy(
    cwsFb,
    /** @param {any} r */ (r) => (r.status ? String(r.status) : null),
  );
  const cfbLine = `피드백 큐 (CFB): ${formatCountMap(cfbBy)}`;

  const awqBy = countBy(
    awq.filter(Boolean),
    /** @param {any} r */ (r) => (r.status ? String(r.status) : null),
  );
  const plBy = countBy(
    plans.filter(Boolean),
    /** @param {any} p */ (p) => (p.status ? String(p.status) : null),
  );
  const wrkBy = countBy(
    works.filter(Boolean),
    /** @param {any} w */ (w) => (w.status ? String(w.status) : null),
  );

  const awqLine = `워크큐 (AWQ): ${formatCountMap(awqBy)}`;
  const plLine = `계획 (PLN): ${formatCountMap(plBy)}`;
  const wrkLine = `업무 (WRK): ${formatCountMap(wrkBy)}`;

  const blockedRows = awq.filter(
    (r) => r && r.status === 'blocked' && r.blocker && String(r.blocker).trim(),
  );
  const blockers = blockedRows.slice(0, 5).map(
    (r) => `AWQ \`${r.id}\`: ${String(r.blocker).trim().slice(0, 200)}`,
  );

  const pendingExec = awq.filter((r) => r && r.status === 'pending_executive');
  const queuedWrk = awq.filter((r) => r && r.status === 'queued' && r.linked_work_id);
  const inProg = awq.filter((r) => r && r.status === 'in_progress');

  /** @type {string[]} */
  const decisions = [];
  if (pendingExec.length) {
    decisions.push(
      `워크큐 승인 게이트 ${pendingExec.length}건 — \`워크큐 대기\` 또는 항목 drill-down`,
    );
  }
  if (plans.some((p) => p && ['review_pending', 'draft'].includes(String(p.status || '')))) {
    decisions.push('PLN 초안·리뷰 대기 건 있음 — \`계획상세\`로 범위·승인 확인');
  }
  const cwsPendingReview = cwsSpec.filter((s) => s && String(s.status || '') === 'pending_review');
  if (cwsPendingReview.length) {
    decisions.push(
      `실행 대기 spec ${cwsPendingReview.length}건 — COS에 실행 전환을 요청하세요`,
    );
  }
  const cfbPendingReview = cwsFb.filter((s) => s && String(s.status || '') === 'pending_review');
  if (cfbPendingReview.length) {
    decisions.push(
      `고객 피드백 미처리 ${cfbPendingReview.length}건 — \`/g1cos 고객 피드백 목록\`으로 확인 후 COS에 실행을 요청하세요`,
    );
  }

  /** @type {string[]} */
  const next = [];
  if (queuedWrk.length) {
    next.push(
      `queued · WRK 연결 ${queuedWrk.length}건 — \`커서발행\`·\`이슈발행\` 등 실행 브리지`,
    );
  }
  if (inProg.length) {
    next.push(`진행 중 AWQ ${inProg.length}건 — \`워크큐증거\`·\`러너증거\`로 증거 유지`);
  }
  if (blockedRows.length) {
    next.push('보류 AWQ — 항목별 \`워크큐재개 <AWQ-…>\`');
  }
  if (cwsPendingReview.length) {
    next.push(
      `실행 대기 항목 → 계획/작업 전환이 필요합니다`,
    );
  }
  if (cfbPendingReview.length) {
    next.push(
      `고객 피드백 ${cfbPendingReview.length}건 처리 필요`,
    );
  }

  const proofSeen = new Set();
  /** @type {string[]} */
  const proofRefs = [];
  for (const r of awq) {
    if (!r || !Array.isArray(r.proof_refs)) continue;
    for (const pr of r.proof_refs) {
      const s = String(pr || '').trim();
      if (!s || proofSeen.has(s) || proofRefs.length >= 12) continue;
      proofSeen.add(s);
      proofRefs.push(s);
    }
  }

  const has_operating_data =
    awq.length > 0 || plans.length > 0 || works.length > 0 || cwsSpec.length > 0 || cwsFb.length > 0;

  const progress_change = [
    '**운영 스냅샷 (v1)** — 로컬 JSON 스토어·워크큐 기준',
    awqLine,
    plLine,
    wrkLine,
    cwsLine,
    cfbLine,
  ].join('\n');

  if (!has_operating_data) {
    return {
      progress_change:
        '**운영 스냅샷 (v1)** — 아직 운영 데이터가 없습니다. COS에 프로젝트·계획·실행을 요청하면 채워집니다.',
      current_blockers: ['데이터 없음 — COS에 요청을 시작하세요'],
      decisions_needed: decisions.length
        ? decisions
        : ['COS에 비교 검토를 요청하면 선택지를 정리해 드립니다'],
      cos_next_action: next.length
        ? next
        : ['`프로젝트시작:` / `툴시작:` 목표 한 줄 → COS가 정렬 질문'],
      proof_refs: [],
      has_operating_data: false,
    };
  }

  return {
    progress_change,
    current_blockers: blockers.length
      ? blockers
      : ['활성 블로커 메모 없음 (워크큐 `blocked`·`blocker` 필드 기준)'],
    decisions_needed: decisions.length
      ? decisions
      : ['대표 결정 큐 대기 없음 (pending_executive AWQ·PLN review_pending 기준)'],
    cos_next_action: next.length
      ? next
      : ['우선순위 PLN/WRK를 골라 `계획진행`·`업무상세`로 drill-down'],
    proof_refs: proofRefs,
    has_operating_data: true,
  };
}

/**
 * @param {object} packet — `ExecutiveStatusPacket`
 * @param {Awaited<ReturnType<typeof gatherExecutiveOperatingRollup>>} rollup
 */
export function applyRollupToExecutiveStatusPacket(packet, rollup) {
  const proof = [...(packet.proof_refs || []), ...(rollup.proof_refs || [])];
  const seen = new Set();
  /** @type {string[]} */
  const mergedProof = [];
  for (const p of proof) {
    const s = String(p || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    mergedProof.push(s);
    if (mergedProof.length >= 15) break;
  }
  return {
    ...packet,
    progress_change: rollup.progress_change,
    current_blockers: rollup.current_blockers,
    decisions_needed: rollup.decisions_needed,
    cos_next_action: rollup.cos_next_action,
    proof_refs: mergedProof,
  };
}
