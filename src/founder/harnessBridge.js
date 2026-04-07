/**
 * COS 뒤 Harness — COS가 준 조직·패킷을 canonical envelope로 정리 (판단·워크플로 강제 없음).
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from './executionLedger.js';

const PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/** 역할표(state machine 아님). COS가 팀 조립 시 참고. */
export const PERSONA_REGISTRY = {
  research: {
    id: 'research',
    purpose: '시장·경쟁·근거 조사와 불확실성 정리',
    typical_deliverables: ['리서치 메모', '가정 목록', '근거 링크'],
    handoff_strengths: ['가설 정리', '리스크 질문', 'pm·엔지니어에 맥락 전달'],
  },
  pm: {
    id: 'pm',
    purpose: '범위·우선순위·성공 기준과 이해관계자 정합',
    typical_deliverables: ['요구 요약', 'MVP 범위', '릴리즈 기준'],
    handoff_strengths: ['스코프 락', '우선순위', '엔지니어·디자인과 정렬'],
  },
  engineering: {
    id: 'engineering',
    purpose: '구현·아키텍처·품질과 기술 리스크',
    typical_deliverables: ['기술 설계', '태스크 분해', '구현 노트'],
    handoff_strengths: ['실행 가능 스펙', '기술 트레이드오프', 'qa에 검증 포인트 전달'],
  },
  design: {
    id: 'design',
    purpose: 'UX·정보 구조·접근성과 일관된 경험',
    typical_deliverables: ['플로우', '와이어', 'UI 가이드'],
    handoff_strengths: ['사용자 관점', '엔지니어에 UI 계약', 'pm과 범위 동기화'],
  },
  qa: {
    id: 'qa',
    purpose: '검증·회귀·엣지 케이스와 출시 전 품질 게이트',
    typical_deliverables: ['테스트 플랜', '버그 리스트', '사인오프'],
    handoff_strengths: ['출시 리스크 가시화', '회귀 범위', '엔지니어 피드백 루프'],
  },
  data: {
    id: 'data',
    purpose: '지표·파이프라인·실험과 데이터 계약',
    typical_deliverables: ['지표 정의', '쿼리/스키마 메모', '대시보드 초안'],
    handoff_strengths: ['측정 가능성', '스키마·엔지니어 정렬', 'pm에 인사이트'],
  },
};

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
function normalizeCosPackets(raw, handoff_order, team_plan, deliverables, constraints) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const p = raw[i];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const persona = String(p.persona || '').toLowerCase().trim();
    if (!PERSONA_ENUM.has(persona)) continue;
    const mission = String(p.mission || '').trim();
    if (!mission) continue;
    const packet_id =
      String(p.packet_id || '').trim() ||
      `pkt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${i}`;
    const inputs = Array.isArray(p.inputs) ? p.inputs.map((x) => String(x)) : [...constraints];
    const dels = Array.isArray(p.deliverables) ? p.deliverables.map((x) => String(x)) : [...deliverables];
    const dod = Array.isArray(p.definition_of_done)
      ? p.definition_of_done.map((x) => String(x))
      : dels.length
        ? [...dels]
        : [mission];
    const handoff_to = p.handoff_to != null ? String(p.handoff_to) : '';
    const artifact_format = String(p.artifact_format || 'spec_markdown').trim() || 'spec_markdown';
    out.push({
      packet_id,
      persona,
      mission,
      inputs,
      deliverables: dels,
      definition_of_done: dod,
      handoff_to,
      artifact_format,
    });
  }
  return out;
}

/**
 * COS가 준 personas/tasks/deliverables로만 봉투 생성 (의미 해석·우선순위 판단 없음).
 */
function buildEnvelopePackets(handoff_order, team_plan, deliverables, constraints, objective) {
  const plist = handoff_order.length ? handoff_order : ['pm'];
  const planByPersona = Object.fromEntries(team_plan.map((x) => [x.persona, x.mission]));
  const packets = [];
  for (let i = 0; i < plist.length; i += 1) {
    const persona = plist[i];
    const next = plist[i + 1];
    const mission = planByPersona[persona] || objective || `역할: ${persona}`;
    const packet_id = `pkt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${i}`;
    const dels =
      deliverables.length > 0
        ? [deliverables[i] || deliverables[deliverables.length - 1]].filter(Boolean)
        : [mission];
    packets.push({
      packet_id,
      persona,
      mission,
      inputs: [...constraints],
      deliverables: dels.length ? dels : [mission],
      definition_of_done: dels.length ? [...dels] : [mission],
      handoff_to: next || '',
      artifact_format: 'spec_markdown',
    });
  }
  return packets;
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{ threadKey?: string }} [ctx]
 */
export async function runHarnessOrchestration(payload, ctx = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const threadKey = ctx.threadKey ? String(ctx.threadKey) : '';
  const objective = String(p.objective || '').trim();
  const rawPersonas = Array.isArray(p.personas) ? p.personas : [];
  const personas = [
    ...new Set(
      rawPersonas
        .map((x) => String(x).toLowerCase().trim())
        .filter((x) => PERSONA_ENUM.has(x)),
    ),
  ];
  const tasks = Array.isArray(p.tasks) ? p.tasks.map((t) => String(t).trim()).filter(Boolean) : [];
  const deliverables = Array.isArray(p.deliverables)
    ? p.deliverables.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const constraints = Array.isArray(p.constraints)
    ? p.constraints.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const extraSuccess = Array.isArray(p.success_criteria)
    ? p.success_criteria.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const extraRisks = Array.isArray(p.risks) ? p.risks.map((t) => String(t).trim()).filter(Boolean) : [];

  /** @type {{ persona: string, mission: string }[]} */
  const team_plan = [];
  const plist = personas.length ? personas : objective ? ['pm'] : [];
  for (let i = 0; i < plist.length; i += 1) {
    const persona = plist[i];
    team_plan.push({
      persona,
      mission: tasks[i] || objective || `역할: ${persona}`,
    });
  }

  const team_shape = plist.join('+') || 'pm';
  const handoff_order = [...plist];
  const success_criteria =
    extraSuccess.length > 0 ? extraSuccess : deliverables.length > 0 ? deliverables : [objective || '목표 달성'];
  const risks = extraRisks.length > 0 ? extraRisks : constraints.length > 0 ? [...constraints] : ['미정의 제약·일정 압박'];

  let packets = normalizeCosPackets(p.packets, handoff_order, team_plan, deliverables, constraints);
  if (!packets.length) {
    packets = buildEnvelopePackets(handoff_order, team_plan, deliverables, constraints, objective);
  }

  const dispatch_id = `harness_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const result = {
    ok: true,
    mode: 'harness_dispatch',
    dispatch_id,
    status: 'accepted',
    personas: plist,
    objective,
    tasks,
    deliverables,
    constraints,
    team_plan,
    team_shape,
    handoff_order,
    success_criteria,
    risks,
    packets,
    next_step: 'cursor_spec_emit',
  };

  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'harness_dispatch',
      summary: `${dispatch_id} ${objective.slice(0, 120)}`,
      payload: { ...result },
    });
    for (const pkt of packets) {
      await appendExecutionArtifact(threadKey, {
        type: 'harness_packet',
        summary: `${pkt.packet_id} ${pkt.persona} → ${pkt.handoff_to || '(end)'}`,
        payload: { ...pkt, dispatch_id },
      });
    }
  }

  return result;
}
