/**
 * W10-A — Proactive Surface Policy (audit/draft only).
 *
 * 이 모듈은 `buildProactiveSignals` 가 roll-up 한 신호 집합을 입력으로 받아
 * **어떤 신호를 founder 대화 입력 맨 위 "운영 메모" 자리에 띄울지**를 순수 함수로 결정한다.
 *
 * 헌법 §4 단일 송신 경로(`runFounderDirectConversation` → `sendFounderResponse`) 를 지키기 위해
 * 이 모듈은 직접 Slack/Supabase/메일/웹훅을 호출하지 않으며, 새 송신 경로를 만들지 않는다.
 * founder 본문에는 이 모듈이 만든 compact lines 가 **기존 대화 입력 블록**에 병치되어 들어가며,
 * 최종 렌더·송신은 이미 있던 `sendFounderResponse` 단일 spine 이 담당한다.
 *
 * 순수 함수 원칙:
 *  - 입력 = buildProactiveSignals 결과(signals) + 최근 founder 턴 컨텍스트(optional) + now.
 *  - 출력 = { selected_signals, suppressed_signals, compact_lines, policy_reasons }.
 *  - 외부 I/O 금지.
 */

/** @typedef {import('./proactiveSignals.js').ProactiveSignal} ProactiveSignal */

/** @type {readonly ('blocker'|'attention'|'info')[]} */
export const SURFACE_SEVERITY_ORDER = Object.freeze(['blocker', 'attention', 'info']);

const SEVERITY_RANK = Object.freeze({ blocker: 3, attention: 2, info: 1 });

const DEFAULT_MAX_SURFACED = 3;
const DEFAULT_RATE_LIMIT_MINUTES = 30;

/**
 * @typedef {Object} ProactiveSurfacePolicyInput
 * @property {ProactiveSignal[]} signals
 * @property {Array<{role: string, text: string}>} [recent_turns]
 * @property {string | null} [now_iso]
 * @property {string | null} [last_surfaced_at_iso] — 마지막으로 같은 kind 를 띄운 시각
 * @property {number} [max_surfaced]
 * @property {number} [rate_limit_minutes]
 */

/**
 * @typedef {Object} ProactiveSurfacePolicyOutput
 * @property {ProactiveSignal[]} selected_signals
 * @property {Array<{signal: ProactiveSignal, reason: string}>} suppressed_signals
 * @property {string[]} compact_lines — founder 대화 입력에 삽입할 자연어 라인
 * @property {string[]} policy_reasons — 감사용, founder 본문 노출 금지
 */

/**
 * Decide which signals to surface. Pure function.
 *
 * Rules:
 *  1) Only blocker / attention pass by default; info 는 surface 하지 않는다(로그는 남김).
 *  2) Max N lines (default 3), sorted by severity desc, then kind.
 *  3) Dedup: 같은 kind 는 1회만.
 *  4) Rate-limit: 동일 kind 가 최근 `rate_limit_minutes` 내 직전 assistant 턴에서 이미 언급됐으면 skip.
 *  5) 내부 jargon(`resolution_class`/`run_id`/토큰) 이 summary_line 에 섞여 있으면 거부.
 *
 * @param {ProactiveSurfacePolicyInput} input
 * @returns {ProactiveSurfacePolicyOutput}
 */
export function applyProactiveSurfacePolicy(input = {}) {
  const signals = Array.isArray(input.signals) ? input.signals.filter(Boolean) : [];
  const maxSurfaced = Number.isFinite(input.max_surfaced) && input.max_surfaced > 0
    ? Math.min(8, Math.trunc(input.max_surfaced))
    : DEFAULT_MAX_SURFACED;
  const recentTurns = Array.isArray(input.recent_turns) ? input.recent_turns : [];
  const nowMs = toMillis(input.now_iso) || Date.now();
  const lastSurfacedMs = toMillis(input.last_surfaced_at_iso);
  const rateLimitMs = (Number.isFinite(input.rate_limit_minutes) && input.rate_limit_minutes > 0
    ? Math.trunc(input.rate_limit_minutes)
    : DEFAULT_RATE_LIMIT_MINUTES) * 60000;

  /** @type {ProactiveSignal[]} */
  const eligible = [];
  /** @type {Array<{signal: ProactiveSignal, reason: string}>} */
  const suppressed = [];
  const seenKinds = new Set();
  const lastAssistantText = lastAssistantTextOf(recentTurns);

  const sorted = signals.slice().sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  for (const sig of sorted) {
    if (!sig || typeof sig !== 'object') continue;
    const sev = sig.severity;
    if (sev !== 'blocker' && sev !== 'attention') {
      suppressed.push({ signal: sig, reason: 'severity_below_surface_threshold' });
      continue;
    }
    if (containsInternalJargon(sig.summary_line)) {
      suppressed.push({ signal: sig, reason: 'contains_internal_jargon' });
      continue;
    }
    if (seenKinds.has(sig.kind)) {
      suppressed.push({ signal: sig, reason: 'duplicate_kind' });
      continue;
    }
    if (
      lastSurfacedMs &&
      nowMs - lastSurfacedMs < rateLimitMs &&
      lastAssistantTextContainsKind(lastAssistantText, sig.kind)
    ) {
      suppressed.push({ signal: sig, reason: 'rate_limited_recent_surface' });
      continue;
    }
    if (eligible.length >= maxSurfaced) {
      suppressed.push({ signal: sig, reason: 'max_surfaced_reached' });
      continue;
    }
    eligible.push(sig);
    seenKinds.add(sig.kind);
  }

  const compact_lines = eligible.map((s) => String(s.summary_line || '').trim()).filter(Boolean);
  const policy_reasons = [
    `selected=${eligible.length}`,
    `suppressed=${suppressed.length}`,
    `max=${maxSurfaced}`,
    `rate_limit_min=${rateLimitMs / 60000}`,
  ];

  return {
    selected_signals: eligible,
    suppressed_signals: suppressed,
    compact_lines,
    policy_reasons,
  };
}

function severityRank(sev) {
  return SEVERITY_RANK[sev] || 0;
}

function toMillis(v) {
  if (!v || typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const INTERNAL_JARGON_PATTERNS = [
  /resolution_class/i,
  /\brun_id\b/i,
  /\bpacket_id\b/i,
  /\bemit_patch\b/i,
  /\bbinding_kind\b/i,
  /\bparcel_deployment_key\b/i,
  /\bworkcell_runtime\b/i,
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,
  /ghp_[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
];

function containsInternalJargon(s) {
  if (typeof s !== 'string' || !s) return false;
  return INTERNAL_JARGON_PATTERNS.some((re) => re.test(s));
}

function lastAssistantTextOf(recentTurns) {
  for (let i = recentTurns.length - 1; i >= 0; i -= 1) {
    const t = recentTurns[i];
    if (t && t.role === 'assistant' && typeof t.text === 'string') return t.text;
  }
  return '';
}

const KIND_PHRASE_HINTS = Object.freeze({
  stale_run: ['멈춰', '진행 신호'],
  unresolved_escalation: ['에스컬레이션'],
  missing_binding: ['필요한 연결', '아직 없음'],
  delivery_ready: ['전달 준비'],
  human_gate_required: ['사람 승인', '게이트'],
  multi_project_health: ['여러 프로젝트'],
});

function lastAssistantTextContainsKind(text, kind) {
  if (!text || !kind) return false;
  const hints = KIND_PHRASE_HINTS[kind] || [];
  if (hints.length === 0) return false;
  return hints.some((h) => text.includes(h));
}
