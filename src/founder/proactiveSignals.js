/**
 * W7-A — Proactive COS ops signals (SSOT).
 *
 * Track D (W5-W7 Gap Analysis §8): COS 가 운영자처럼 능동 신호를 모델 입력에 **붙이되**,
 *   ‑ 신규 Slack 송신 경로를 만들지 않고
 *   ‑ 헌법 §6 내부 jargon 노출 금지를 그대로 따른다.
 *
 * 이 모듈은 **pure** 이다. 외부 tool/lane/slack/supabase 를 **직접** 호출하지 않는다.
 * 모든 신호는 이미 관찰된 truth 를 roll-up 한다:
 *   - active_run_shell: 활성 런 셸
 *   - workcell_runtime: 현재 dispatch 워크셀 상태
 *   - active_project_space_slice: W5-B 에서 병치된 project-space 슬라이스
 *   - surface_model (optional): founderSurfaceModel 결과 — human_gate 정보 mirror 용
 *   - recent_run_shells (optional): 다중 프로젝트 상태를 보기 위한 최근 활성 런 셸 목록
 *   - now_iso: 테스트에서 deterministic 하게 stale 임계를 재현하기 위한 "현재 시각"
 *
 * 반환은 compact line 배열만 노출한다. founder 본문에는 재가공 없이 붙지 않는다.
 */

/** @type {readonly string[]} */
export const PROACTIVE_SIGNAL_KINDS = Object.freeze([
  'stale_run',
  'unresolved_escalation',
  'missing_binding',
  'delivery_ready',
  'human_gate_required',
  'multi_project_health',
]);

const PROACTIVE_SIGNAL_KINDS_SET = new Set(PROACTIVE_SIGNAL_KINDS);

/** @type {readonly string[]} */
const STALE_RUN_STATUSES = Object.freeze([
  'running',
  'dispatched',
  'accepted',
  'in_progress',
  'progress',
]);
const STALE_RUN_STATUS_SET = new Set(STALE_RUN_STATUSES);

/** Default threshold: 30 분 이상 update 없는 running 셸 = stale. */
const DEFAULT_STALE_RUN_MINUTES = 30;

/** Required binding kinds for a project space to be 'ready for spinup'. */
/** @type {readonly string[]} */
const REQUIRED_BINDING_KINDS = Object.freeze([
  'repo_binding',
  'deploy_binding',
  'db_binding',
]);

/**
 * @typedef {Object} ProactiveSignal
 * @property {string} kind — one of PROACTIVE_SIGNAL_KINDS
 * @property {'info'|'attention'|'blocker'} severity
 * @property {string} summary_line — compact line suitable for model consumption (no internal jargon)
 * @property {Record<string, unknown>} [evidence] — minimal structured evidence (testing only)
 */

/**
 * @param {unknown} v
 * @returns {Record<string, unknown> | null}
 */
function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : null;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function asTrimmedString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {string} iso
 * @returns {number | null}
 */
function parseIsoMillis(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {{
 *   active_run_shell?: unknown,
 *   workcell_runtime?: unknown,
 *   active_project_space_slice?: unknown,
 *   surface_model?: unknown,
 *   recent_run_shells?: unknown[],
 *   now_iso?: string | null,
 *   stale_run_minutes?: number,
 * }} input
 * @returns {{ signals: ProactiveSignal[], compact_lines: string[] }}
 */
export function buildProactiveSignals(input = {}) {
  const shell = asObject(input.active_run_shell);
  const wc = asObject(input.workcell_runtime) || asObject(shell && shell.workcell_runtime);
  const aps = asObject(input.active_project_space_slice);
  const sm = asObject(input.surface_model);
  const recentShells = Array.isArray(input.recent_run_shells) ? input.recent_run_shells : [];
  const staleMinutes = typeof input.stale_run_minutes === 'number' && input.stale_run_minutes > 0
    ? input.stale_run_minutes
    : DEFAULT_STALE_RUN_MINUTES;

  /** @type {ProactiveSignal[]} */
  const signals = [];

  // 1) stale_run
  if (shell) {
    const status = asTrimmedString(shell.status).toLowerCase();
    const updatedAtRaw = asTrimmedString(shell.updated_at);
    const updatedAtMs = parseIsoMillis(updatedAtRaw);
    const nowMs = parseIsoMillis(asTrimmedString(input.now_iso)) || Date.now();
    if (STALE_RUN_STATUS_SET.has(status) && updatedAtMs != null) {
      const ageMin = (nowMs - updatedAtMs) / 60000;
      if (ageMin >= staleMinutes) {
        signals.push({
          kind: 'stale_run',
          severity: 'attention',
          summary_line: `실행이 ${Math.floor(ageMin)}분째 진행 신호 없이 멈춰 있음 (status=${status})`,
          evidence: { status, age_minutes: Math.floor(ageMin) },
        });
      }
    }
  }

  // 2) unresolved_escalation
  if (wc) {
    const escOpen = wc.escalation_open === true;
    const targets = Array.isArray(wc.escalation_targets) ? wc.escalation_targets.slice(0, 8) : [];
    if (escOpen || targets.length > 0) {
      const n = targets.length;
      signals.push({
        kind: 'unresolved_escalation',
        severity: 'blocker',
        summary_line: n > 0
          ? `해결되지 않은 에스컬레이션 ${n}건이 남아 있음`
          : '에스컬레이션이 열려 있고 아직 닫히지 않음',
        evidence: { escalation_open: escOpen, target_count: n },
      });
    }
  }

  // 3) missing_binding
  if (aps && aps.project_space_key) {
    const lines = Array.isArray(aps.bindings_compact_lines) ? aps.bindings_compact_lines : [];
    /** @type {Set<string>} */
    const observedKinds = new Set();
    for (const l of lines) {
      const s = asTrimmedString(l);
      for (const k of REQUIRED_BINDING_KINDS) {
        if (s.includes(k)) observedKinds.add(k);
      }
    }
    /** @type {string[]} */
    const missing = [];
    for (const k of REQUIRED_BINDING_KINDS) {
      if (!observedKinds.has(k)) missing.push(k);
    }
    if (missing.length > 0) {
      signals.push({
        kind: 'missing_binding',
        severity: 'attention',
        summary_line: `프로젝트 공간에 필요한 연결이 아직 없음: ${describeMissingBindings(missing)}`,
        evidence: { missing_binding_kinds: missing },
      });
    }
  }

  // 4) delivery_ready
  if (sm) {
    const intent = asTrimmedString(sm.surface_intent).toLowerCase();
    const deliverables = Array.isArray(sm.deliverables) ? sm.deliverables : [];
    const blocker = asTrimmedString(sm.blocker_reason);
    const escOpen = wc ? wc.escalation_open === true : false;
    if (intent === 'completed' && deliverables.length > 0 && !blocker && !escOpen) {
      signals.push({
        kind: 'delivery_ready',
        severity: 'info',
        summary_line: `산출물이 준비된 상태로 정리되어 있음 (${deliverables.length}건)`,
        evidence: { deliverable_count: deliverables.length },
      });
    }
  }

  // 5) human_gate_required — mirror, do NOT re-derive
  if (sm && sm.human_gate_required === true) {
    const gateLine = asTrimmedString(sm.human_gate_action) || asTrimmedString(sm.human_gate_reason);
    signals.push({
      kind: 'human_gate_required',
      severity: 'blocker',
      summary_line: gateLine
        ? `사람이 확인해야 하는 지점이 있음: ${gateLine}`
        : '사람이 확인해야 하는 지점이 있음',
      evidence: {},
    });
  } else if (aps && typeof aps.open_human_gate_count === 'number' && aps.open_human_gate_count > 0) {
    signals.push({
      kind: 'human_gate_required',
      severity: 'blocker',
      summary_line: `프로젝트 공간에 열린 사람 확인 지점 ${aps.open_human_gate_count}건`,
      evidence: { open_human_gate_count: aps.open_human_gate_count },
    });
  }

  // 6) multi_project_health — divergence across observed spaces
  {
    /** @type {Map<string, { running: number, blocked: number, total: number }>} */
    const perSpace = new Map();
    const pushOne = (/** @type {unknown} */ s) => {
      const o = asObject(s);
      if (!o) return;
      const key = asTrimmedString(o.project_space_key);
      if (!key) return;
      const status = asTrimmedString(o.status).toLowerCase();
      const curr = perSpace.get(key) || { running: 0, blocked: 0, total: 0 };
      curr.total += 1;
      if (STALE_RUN_STATUS_SET.has(status)) curr.running += 1;
      if (status === 'blocked' || status === 'failed' || status === 'escalated') curr.blocked += 1;
      perSpace.set(key, curr);
    };
    if (shell) pushOne(shell);
    for (const rs of recentShells) pushOne(rs);
    if (perSpace.size >= 2) {
      const hasBlocked = Array.from(perSpace.values()).some((v) => v.blocked > 0);
      const hasRunning = Array.from(perSpace.values()).some((v) => v.running > 0);
      if (hasBlocked && hasRunning) {
        signals.push({
          kind: 'multi_project_health',
          severity: 'attention',
          summary_line: `다중 프로젝트 상태가 갈림: ${perSpace.size}개 공간 중 일부 진행/일부 막힘`,
          evidence: { space_count: perSpace.size },
        });
      }
    }
  }

  const compact_lines = signals.slice(0, 8).map((s) => `[${s.kind}] ${s.summary_line}`);
  return { signals, compact_lines };
}

/**
 * @param {string[]} missing
 * @returns {string}
 */
function describeMissingBindings(missing) {
  const labels = missing.map((k) => {
    if (k === 'repo_binding') return '코드 저장소';
    if (k === 'deploy_binding') return '배포';
    if (k === 'db_binding') return '데이터베이스';
    return k;
  });
  return labels.join(', ');
}

/** @param {string} kind */
export function isKnownProactiveSignalKind(kind) {
  return typeof kind === 'string' && PROACTIVE_SIGNAL_KINDS_SET.has(kind);
}
