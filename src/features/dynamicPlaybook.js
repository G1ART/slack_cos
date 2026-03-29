/**
 * Dynamic Playbook Engine — open-world task interpretation + playbook lifecycle.
 *
 * 고정 taxonomy 대신 자연어 입력을 task hypothesis로 해석하고,
 * 반복 패턴은 promoted playbook으로 승격한다.
 *
 * @see COS_OpenWorld_Dynamic_Playbook_2026-03.md
 */

import { buildSlackThreadKey } from './slackConversationBuffer.js';
import { appendJsonRecord, readJsonArray } from '../storage/jsonStore.js';
import { resolvePlaybooksPath } from '../storage/paths.js';

/* ------------------------------------------------------------------ */
/*  Research Surface Patterns                                          */
/* ------------------------------------------------------------------ */

const RESEARCH_PATTERNS = [
  /알아봐\s*줘|알아봐/u,
  /찾아\s*줘|찾아봐/u,
  /정리\s*해\s*줘|정리해줘/u,
  /비교\s*해\s*줘|비교해줘/u,
  /벤치마킹|벤치마크/u,
  /현재|최신|지금|아직\s*마감\s*(?:안|않)/u,
  /shortlist|후보|추천/iu,
  /자격\s*요건|eligibility/iu,
  /사례\s*조사|market\s*scan|government\s*program/iu,
  /조사\s*해|리서치|research/iu,
  /리스트\s*(?:만들|뽑)/u,
  /현황\s*파악/u,
];

const FRESHNESS_PATTERNS = [
  /아직\s*마감\s*(?:안|않)/u,
  /현재\s*열려\s*있는/u,
  /최신|지금\s*가능한|최근/u,
  /올해|금년|2026|이번\s*(?:달|분기)/u,
];

const EXECUTION_PATTERNS = [
  /만들어\s*줘|만들어줘|만들자/u,
  /작성\s*해\s*줘|작성해줘/u,
  /준비\s*해\s*줘|준비해줘/u,
  /짜\s*줘|짜줘|세워\s*줘/u,
  /급히|긴급|빨리|ASAP/iu,
  /시작\s*하자|시작해/u,
  /개발\s*해|구현\s*해/u,
];

/* ------------------------------------------------------------------ */
/*  Open-World Kind Inference                                          */
/* ------------------------------------------------------------------ */

const KIND_HINTS = [
  { re: /정부\s*지원\s*사업|지원\s*사업|보조금|grant/iu, kind: 'grant_research' },
  { re: /발표\s*자료|프레젠테이션|PPT|슬라이드|deck/iu, kind: 'presentation_build' },
  { re: /IR\s*deck|투자\s*유치|투자\s*전략|fundrais/iu, kind: 'fundraising_strategy' },
  { re: /예산|재배분|budget/iu, kind: 'budget_reallocation' },
  { re: /시장\s*조사|market\s*(?:research|scan|analysis)/iu, kind: 'market_research' },
  { re: /경쟁\s*분석|competitor|벤치마크/iu, kind: 'competitive_analysis' },
  { re: /사업\s*계획|business\s*plan/iu, kind: 'business_planning' },
  { re: /가격|pricing|과금/iu, kind: 'pricing_analysis' },
  { re: /채용|recruit|인재/iu, kind: 'recruiting_plan' },
  { re: /법률|법적|legal|계약서/iu, kind: 'legal_review' },
  { re: /세무|세금|tax/iu, kind: 'tax_review' },
  { re: /마케팅|marketing|홍보/iu, kind: 'marketing_plan' },
  { re: /캘린더|일정|스케줄|예약/iu, kind: 'calendar_tool' },
  { re: /디자인|UI|UX|와이어프레임/iu, kind: 'design_spec' },
  { re: /데이터\s*분석|analytics|대시보드/iu, kind: 'data_analysis' },
  { re: /보고서|report|리포트/iu, kind: 'report_build' },
];

function inferKind(text) {
  const t = String(text || '');
  for (const { re, kind } of KIND_HINTS) {
    if (re.test(t)) return kind;
  }
  const slug = t.replace(/[^a-zA-Z가-힣0-9]/g, '_').slice(0, 30).toLowerCase();
  return `ad_hoc_${slug || 'task'}`;
}

/* ------------------------------------------------------------------ */
/*  Task Hypothesis Interpreter                                        */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{
 *   kind: string,
 *   confidence: number,
 *   mode: 'answer' | 'research' | 'execution' | 'hybrid',
 *   freshness_required: boolean,
 *   followup_needed: boolean,
 *   minimal_missing_fields: string[],
 *   can_answer_now: boolean,
 *   should_open_playbook: boolean,
 *   should_open_execution: boolean,
 *   is_research: boolean,
 * }} DynamicTaskHypothesis
 */

/**
 * @param {string} text
 * @returns {DynamicTaskHypothesis}
 */
export function interpretTask(text) {
  const t = String(text || '').trim();

  const isResearch = RESEARCH_PATTERNS.some((r) => r.test(t));
  const isExecution = EXECUTION_PATTERNS.some((r) => r.test(t));
  const freshness = FRESHNESS_PATTERNS.some((r) => r.test(t));
  const kind = inferKind(t);

  const isKnownKind = !kind.startsWith('ad_hoc_');
  const confidence = isKnownKind ? 0.8 : 0.5;

  let mode = /** @type {'answer' | 'research' | 'execution' | 'hybrid'} */ ('answer');
  if (isResearch && isExecution) mode = 'hybrid';
  else if (isExecution) mode = 'execution';
  else if (isResearch) mode = 'research';

  const canAnswerNow = !isResearch && !isExecution && t.length < 100;
  const shouldOpenPlaybook = isResearch || isExecution || t.length > 60;
  const shouldOpenExecution = isExecution && !isResearch;

  return {
    kind,
    confidence,
    mode,
    freshness_required: freshness,
    followup_needed: !canAnswerNow,
    minimal_missing_fields: [],
    can_answer_now: canAnswerNow,
    should_open_playbook: shouldOpenPlaybook,
    should_open_execution: shouldOpenExecution,
    is_research: isResearch,
  };
}

/**
 * Lightweight check: does the input look like a research question?
 * @param {string} text
 */
export function isResearchSurfaceCandidate(text) {
  return RESEARCH_PATTERNS.some((r) => r.test(String(text || '')));
}

/**
 * Lightweight check: does the input need fresh/live data?
 * @param {string} text
 */
export function isFreshnessRequired(text) {
  return FRESHNESS_PATTERNS.some((r) => r.test(String(text || '')));
}

/* ------------------------------------------------------------------ */
/*  Playbook Object                                                    */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{
 *   playbook_id: string,
 *   thread_key: string,
 *   kind: string,
 *   mode: 'answer' | 'research' | 'execution' | 'hybrid',
 *   status: 'draft' | 'active' | 'promoted' | 'completed' | 'cancelled',
 *   task_summary: string,
 *   inputs_known: Record<string, unknown>,
 *   inputs_missing: string[],
 *   output_contract: string[],
 *   freshness_required: boolean,
 *   execution_eligible: boolean,
 *   created_at: string,
 *   updated_at: string,
 *   use_count: number,
 *   promoted_label: string | null,
 *   reusable_checklist: string[],
 * }} DynamicPlaybook
 */

function makePlaybookId() {
  return `PBK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** @type {Map<string, DynamicPlaybook>} */
const playbooksByThread = new Map();

/** @type {Map<string, DynamicPlaybook>} */
const playbooksById = new Map();

/** @type {Map<string, number>} kind → use count for promotion */
const kindUseCounts = new Map();

const PROMOTION_THRESHOLD = 3;

/**
 * @param {string} threadKey
 * @param {DynamicTaskHypothesis} hypothesis
 * @param {string} userText
 * @returns {DynamicPlaybook}
 */
export function openPlaybook(threadKey, hypothesis, userText) {
  const now = new Date().toISOString();
  const pb = {
    playbook_id: makePlaybookId(),
    thread_key: threadKey,
    kind: hypothesis.kind,
    mode: hypothesis.mode,
    status: /** @type {'active'} */ ('active'),
    task_summary: String(userText || '').slice(0, 500),
    inputs_known: {},
    inputs_missing: hypothesis.minimal_missing_fields,
    output_contract: [],
    freshness_required: hypothesis.freshness_required,
    execution_eligible: hypothesis.should_open_execution,
    created_at: now,
    updated_at: now,
    use_count: 1,
    promoted_label: null,
    reusable_checklist: [],
  };

  playbooksByThread.set(threadKey, pb);
  playbooksById.set(pb.playbook_id, pb);

  const cnt = (kindUseCounts.get(hypothesis.kind) || 0) + 1;
  kindUseCounts.set(hypothesis.kind, cnt);

  try { persistPlaybook(pb); } catch { /* ignore */ }

  return pb;
}

/**
 * @param {string} threadKey
 * @returns {DynamicPlaybook | null}
 */
export function getActivePlaybook(threadKey) {
  const pb = playbooksByThread.get(threadKey);
  if (!pb) return null;
  if (pb.status === 'completed' || pb.status === 'cancelled') return null;
  return pb;
}

export function getPlaybookById(id) {
  return playbooksById.get(id) || null;
}

/**
 * Mark a playbook as completed and attempt promotion if threshold met.
 * @param {string} playbookId
 */
export function completePlaybook(playbookId) {
  const pb = playbooksById.get(playbookId);
  if (!pb) return null;
  pb.status = 'completed';
  pb.updated_at = new Date().toISOString();

  const cnt = kindUseCounts.get(pb.kind) || 0;
  if (cnt >= PROMOTION_THRESHOLD && pb.status === 'completed') {
    pb.status = 'promoted';
    pb.promoted_label = pb.kind;
  }

  try { persistPlaybook(pb); } catch { /* ignore */ }
  return pb;
}

/**
 * Check if a kind has been used enough for promotion.
 * @param {string} kind
 */
export function isKindPromotionEligible(kind) {
  return (kindUseCounts.get(kind) || 0) >= PROMOTION_THRESHOLD;
}

/**
 * Force-promote a playbook kind.
 * @param {string} playbookId
 */
export function promotePlaybook(playbookId) {
  const pb = playbooksById.get(playbookId);
  if (!pb) return null;
  pb.status = 'promoted';
  pb.promoted_label = pb.kind;
  pb.updated_at = new Date().toISOString();
  try { persistPlaybook(pb); } catch { /* ignore */ }
  return pb;
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

function persistPlaybook(pb) {
  const fp = resolvePlaybooksPath();
  appendJsonRecord(fp, pb);
}

export function loadPlaybooksFromDisk() {
  try {
    const fp = resolvePlaybooksPath();
    const rows = readJsonArray(fp);
    for (const r of rows) {
      if (!r.playbook_id) continue;
      playbooksById.set(r.playbook_id, r);
      if (r.thread_key && r.status !== 'completed' && r.status !== 'cancelled') {
        playbooksByThread.set(r.thread_key, r);
      }
      if (r.kind) {
        kindUseCounts.set(r.kind, (kindUseCounts.get(r.kind) || 0) + (r.use_count || 1));
      }
    }
  } catch {
    /* first boot — no file */
  }
}

export function clearPlaybooksForTest() {
  playbooksByThread.clear();
  playbooksById.clear();
  kindUseCounts.clear();
}

/* ------------------------------------------------------------------ */
/*  Promoted Playbook Registry (in-memory seed)                        */
/* ------------------------------------------------------------------ */

/** @type {Map<string, { label: string, expected_inputs: string[], default_output_contract: string[], escalation_triggers: string[], execution_eligible: boolean }>} */
const promotedRegistry = new Map();

export function getPromotedPlaybookTemplate(kind) {
  return promotedRegistry.get(kind) || null;
}

export function registerPromotedPlaybook(kind, template) {
  promotedRegistry.set(kind, { ...template, label: kind });
}
