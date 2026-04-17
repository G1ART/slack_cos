/**
 * W12-C — Human-gate escalation contract (pure builder + founder renderer).
 *
 * 정본: docs/cursor-handoffs/W12_LIVE_QUALIFICATION_AND_PACKAGING_PLANMODE_MASTER_INSTRUCTION_2026-04-16.md §3 Slice C.
 *
 * 목적: founder 가 사람 개입이 필요한 gate 를 받았을 때
 *   - 왜 내가 필요한가
 *   - 어디서 해야 하는가
 *   - 무엇을 해야 하는가
 *   - 끝내면 뭐가 이어지는가
 * 를 짧고 자연스러운 한국어로 이해할 수 있게 한다.
 *
 * 내부 토큰(`hil_required_*`, `tool_adapter_unavailable`, `technical_capability_missing`,
 * sink raw key, break_reason_cause enum 값) 은 절대 그대로 노출하지 않는다.
 *
 * 이 모듈은 "신규 founder 송신 경로 0" 원칙을 지킨다 — founderSurfaceModel 내부의
 * compact-lines 흐름에만 주입된다.
 */

/**
 * @typedef {Object} HumanGateEscalationContract
 * @property {string} gate_id
 * @property {string} gate_kind
 * @property {string} reason_why       // 왜 founder 가 필요한가 (한국어)
 * @property {string} where_to_act     // 어디서 (provider humanize)
 * @property {string} exact_action     // 무엇을
 * @property {boolean} resumable
 * @property {string|null} what_resumes  // 다음에 이어지는 단계 설명
 */

const SINK_LABEL = {
  github: 'GitHub 저장소 설정',
  vercel: 'Vercel 프로젝트 대시보드',
  railway: 'Railway 프로젝트 설정',
  supabase: 'Supabase 프로젝트 콘솔',
  openai: 'OpenAI 콘솔',
  slack: 'Slack 앱 설정',
};

const GATE_KIND_LABEL = {
  oauth_authorization: '외부 서비스 권한 승인',
  billing_or_subscription: '결제·구독 설정',
  policy_or_product_decision: '정책·제품 결정',
  manual_secret_entry: '비밀 정보 수동 입력',
  high_risk_approval: '고위험 작업 승인',
};

const RESOLUTION_CLASS_LABEL = {
  external_auth_gate: '외부 서비스 로그인·권한이 아직 준비되지 않아',
  manual_entry_required: '필요한 값이 아직 등록되지 않아',
  policy_decision_required: '제품 방향에 대한 결정이 필요해',
  product_decision_required: '제품 결정이 필요해',
  billing_required: '결제·플랜 설정이 먼저 필요해',
  technical_capability_missing: '해당 도구 기능이 아직 검증되지 않아',
  tool_adapter_unavailable: '해당 도구 연결이 아직 준비되지 않아',
};

const INTERNAL_TOKEN_PATTERNS = [
  /hil_required_[a-z_]+/gi,
  /tool_adapter_unavailable/gi,
  /technical_capability_missing/gi,
  /external_auth_gate/gi,
  /binding_propagation_stop/gi,
  /workcell:[A-Za-z0-9_\-]+/gi,
  /persona:[A-Za-z0-9_\-]+/gi,
];

function redactSecretLike(raw) {
  let s = raw == null ? '' : String(raw);
  s = s.replace(/https?:\/\/\S+/g, '[링크]');
  s = s.replace(/ghp_[A-Za-z0-9]{20,}/g, '[토큰]');
  s = s.replace(/gho_[A-Za-z0-9]{20,}/g, '[토큰]');
  s = s.replace(/sk-[A-Za-z0-9_\-]{20,}/g, '[토큰]');
  s = s.replace(/eyJ[A-Za-z0-9._\-]{10,}/g, '[토큰]');
  return s;
}

function stripInternalTokens(raw) {
  let s = raw == null ? '' : String(raw);
  for (const pat of INTERNAL_TOKEN_PATTERNS) s = s.replace(pat, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function humanizeSink(sinkOrRef) {
  const key = String(sinkOrRef || '').toLowerCase();
  if (SINK_LABEL[key]) return SINK_LABEL[key];
  return '운영자 콘솔';
}

function humanizeGateKind(kind) {
  return GATE_KIND_LABEL[String(kind || '')] || '운영자 확인';
}

function humanizeReason(resolutionClass, fallback) {
  const label = RESOLUTION_CLASS_LABEL[String(resolutionClass || '')];
  if (label) return label;
  if (fallback && typeof fallback === 'string') {
    const cleaned = stripInternalTokens(redactSecretLike(fallback));
    if (cleaned) return cleaned;
  }
  return '다음 단계를 진행하려면 사람의 확인이 필요해';
}

function extractWhereFromGate(gate, qualifiedCap) {
  if (qualifiedCap && qualifiedCap._sink) return humanizeSink(qualifiedCap._sink);
  if (gate && gate.sink_system) return humanizeSink(gate.sink_system);
  if (gate && gate.gate_action && /supabase/i.test(gate.gate_action)) return humanizeSink('supabase');
  if (gate && gate.gate_action && /github/i.test(gate.gate_action)) return humanizeSink('github');
  if (gate && gate.gate_action && /vercel/i.test(gate.gate_action)) return humanizeSink('vercel');
  if (gate && gate.gate_action && /railway/i.test(gate.gate_action)) return humanizeSink('railway');
  return humanizeSink('');
}

function extractAction(gate) {
  const raw =
    (gate && (gate.required_human_action || gate.gate_action)) || '필요한 값을 직접 확인·입력해 주세요';
  return stripInternalTokens(redactSecretLike(String(raw)));
}

function describeWhatResumes(gate) {
  if (!gate) return null;
  if (gate.continuation_packet_id) return '완료하면 중단된 작업 패킷이 자동으로 이어집니다';
  if (gate.continuation_run_id) return '완료하면 해당 실행이 자동으로 이어집니다';
  if (gate.continuation_thread_key) return '완료하면 이 대화 흐름이 자동으로 이어집니다';
  if (gate.resume_target_kind) return '완료하면 남은 단계로 자동 복귀합니다';
  return null;
}

/**
 * @param {{
 *   gate_row: Record<string, unknown>,
 *   failure_classification?: { resolution_class?: string, human_message?: string } | null,
 *   qualified_capability?: any | null,
 * }} input
 * @returns {HumanGateEscalationContract}
 */
export function buildHumanGateEscalationContract(input) {
  const gate = (input && input.gate_row) || {};
  const fc = (input && input.failure_classification) || null;
  const qc = (input && input.qualified_capability) || null;

  const gate_id = String(gate.id || '').trim();
  const gate_kind = String(gate.gate_kind || '').trim();

  const resolutionClass = fc && fc.resolution_class ? String(fc.resolution_class) : null;
  const reason_why = humanizeReason(resolutionClass, fc && fc.human_message);
  const where_to_act = extractWhereFromGate(gate, qc);
  const exact_action = extractAction(gate);

  const resumable = Boolean(
    gate.continuation_packet_id ||
      gate.continuation_run_id ||
      gate.continuation_thread_key ||
      gate.resume_target_kind,
  );
  const what_resumes = describeWhatResumes(gate);

  return Object.freeze({
    gate_id,
    gate_kind,
    reason_why,
    where_to_act,
    exact_action,
    resumable,
    what_resumes,
  });
}

/**
 * 최대 3개 gate 를 1~2줄 자연어로 렌더링.
 * @param {HumanGateEscalationContract[]} contracts
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
export function renderHumanGateEscalationFounderLines(contracts, opts = {}) {
  const max = Math.max(1, Math.min(3, Number(opts.max) || 3));
  const list = Array.isArray(contracts) ? contracts.slice(0, max) : [];
  const lines = [];
  for (const c of list) {
    if (!c) continue;
    const humanKind = humanizeGateKind(c.gate_kind);
    const head = `${humanKind}: ${c.reason_why}.`;
    const how = `${c.where_to_act}에서 ${c.exact_action}`.replace(/\.+$/, '') + '.';
    const tail = c.what_resumes ? ` ${c.what_resumes}.` : '';
    let composed = `${head} ${how}${tail}`.trim();
    composed = composed.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.');
    composed = stripInternalTokens(redactSecretLike(composed));
    lines.push(composed);
  }
  return lines;
}
