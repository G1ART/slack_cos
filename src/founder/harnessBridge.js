/**
 * COS 뒤 Harness — COS dispatch를 실행기 친화적 work packet으로 표준화 (의도 판단 아님).
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from './executionLedger.js';

const PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/** @type {Record<string, object>} */
export const PERSONA_REGISTRY = {
  research: {
    id: 'research',
    purpose: '시장·경쟁·근거 조사와 불확실성 정리',
    typical_deliverables: ['리서치 메모', '가정 목록', '근거 링크'],
    handoff_strengths: ['가설 정리', '리스크 질문', 'pm·엔지니어에 맥락 전달'],
    default_artifact_formats: ['spec_markdown', 'issue_draft'],
    preferred_tools: ['github', 'cursor'],
  },
  pm: {
    id: 'pm',
    purpose: '범위·우선순위·성공 기준과 이해관계자 정합',
    typical_deliverables: ['요구 요약', 'MVP 범위', '릴리즈 기준'],
    handoff_strengths: ['스코프 락', '우선순위', '엔지니어·디자인과 정렬'],
    default_artifact_formats: ['spec_markdown', 'issue_draft'],
    preferred_tools: ['cursor', 'github'],
  },
  engineering: {
    id: 'engineering',
    purpose: '구현·아키텍처·품질과 기술 리스크',
    typical_deliverables: ['기술 설계', '태스크 분해', '구현 노트'],
    handoff_strengths: ['실행 가능 스펙', '기술 트레이드오프', 'qa에 검증 포인트 전달'],
    default_artifact_formats: ['spec_markdown', 'patch_markdown'],
    preferred_tools: ['cursor', 'github', 'railway'],
  },
  design: {
    id: 'design',
    purpose: 'UX·정보 구조·접근성과 일관된 경험',
    typical_deliverables: ['플로우', '와이어', 'UI 가이드'],
    handoff_strengths: ['사용자 관점', '엔지니어에 UI 계약', 'pm과 범위 동기화'],
    default_artifact_formats: ['spec_markdown'],
    preferred_tools: ['cursor'],
  },
  qa: {
    id: 'qa',
    purpose: '검증·회귀·엣지 케이스와 출시 전 품질 게이트',
    typical_deliverables: ['테스트 플랜', '버그 리스트', '사인오프'],
    handoff_strengths: ['출시 리스크 가시화', '회귀 범위', '엔지니어 피드백 루프'],
    default_artifact_formats: ['spec_markdown', 'log_review'],
    preferred_tools: ['github', 'railway'],
  },
  data: {
    id: 'data',
    purpose: '지표·파이프라인·실험과 데이터 계약',
    typical_deliverables: ['지표 정의', '쿼리/스키마 메모', '대시보드 초안'],
    handoff_strengths: ['측정 가능성', '스키마·엔지니어 정렬', 'pm에 인사이트'],
    default_artifact_formats: ['spec_markdown', 'issue_draft'],
    preferred_tools: ['supabase', 'github'],
  },
};

/**
 * artifact_format → 기본 tool/action (COS가 이미 고른 내부 표현을 실행 스펙으로만 매핑)
 * @param {string} fmt
 */
function preferredToolActionFromFormat(fmt) {
  const f = String(fmt || '').trim().toLowerCase();
  if (f === 'patch_markdown') return { preferred_tool: 'cursor', preferred_action: 'emit_patch' };
  if (f === 'issue_draft') return { preferred_tool: 'github', preferred_action: 'create_issue' };
  if (f === 'log_review') return { preferred_tool: 'railway', preferred_action: 'inspect_logs' };
  return { preferred_tool: 'cursor', preferred_action: 'create_spec' };
}

/**
 * @param {Record<string, unknown>} pkt
 * @param {string} persona
 */
function specializePacket(pkt, persona) {
  const pt0 = pkt.preferred_tool != null ? String(pkt.preferred_tool) : null;
  const pa0 = pkt.preferred_action != null ? String(pkt.preferred_action) : null;
  const fromFmt = preferredToolActionFromFormat(String(pkt.artifact_format || 'spec_markdown'));
  const preferred_tool = pt0 || fromFmt.preferred_tool;
  const preferred_action = pa0 || fromFmt.preferred_action;
  let review_required = typeof pkt.review_required === 'boolean' ? pkt.review_required : persona === 'qa';
  const review_focus = Array.isArray(pkt.review_focus)
    ? pkt.review_focus.map((x) => String(x))
    : ['산출물 대비 범위', 'definition_of_done'];
  const packet_status =
    pkt.packet_status === 'draft' || pkt.packet_status === 'ready' ? pkt.packet_status : 'ready';
  return {
    ...pkt,
    preferred_tool,
    preferred_action,
    review_required,
    review_focus,
    packet_status,
  };
}

/**
 * @param {unknown} raw
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
    const base = {
      packet_id,
      persona,
      mission,
      inputs,
      deliverables: dels,
      definition_of_done: dod,
      handoff_to,
      artifact_format,
      preferred_tool: p.preferred_tool != null ? p.preferred_tool : null,
      preferred_action: p.preferred_action != null ? p.preferred_action : null,
      review_required: p.review_required,
      review_focus: p.review_focus,
      packet_status: p.packet_status,
      ...(p.live_patch != null && typeof p.live_patch === 'object' && !Array.isArray(p.live_patch)
        ? { live_patch: p.live_patch }
        : {}),
    };
    out.push(specializePacket(base, persona));
  }
  return out;
}

/**
 * @param {string[]} handoff_order
 * @param {{ persona: string, mission: string }[]} team_plan
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
    const fmt = persona === 'engineering' && dels.some((d) => /patch|diff/i.test(d)) ? 'patch_markdown' : 'spec_markdown';
    const base = {
      packet_id,
      persona,
      mission,
      inputs: [...constraints],
      deliverables: dels.length ? dels : [mission],
      definition_of_done: dels.length ? [...dels] : [mission],
      handoff_to: next || '',
      artifact_format: fmt,
      preferred_tool: null,
      preferred_action: null,
      review_required: undefined,
      review_focus: undefined,
      packet_status: undefined,
    };
    packets.push(specializePacket(base, persona));
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

  const review_checkpoints = Array.isArray(p.review_checkpoints)
    ? p.review_checkpoints.map((x) => String(x))
    : packets.filter((x) => x.review_required).map((x) => `${x.persona}:${x.packet_id}`);
  const open_questions = Array.isArray(p.open_questions) ? p.open_questions.map((x) => String(x)) : [];

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
    review_checkpoints,
    open_questions,
    next_step: 'cursor_spec_emit',
  };

  if (threadKey) {
    const dispatchNeedsReview = packets.some((x) => x.review_required);
    await appendExecutionArtifact(threadKey, {
      type: 'harness_dispatch',
      summary: `${dispatch_id} ${objective.slice(0, 120)}`,
      status: 'accepted',
      needs_review: dispatchNeedsReview,
      review_focus: review_checkpoints.slice(0, 5),
      payload: { ...result },
    });
    for (const pkt of packets) {
      await appendExecutionArtifact(threadKey, {
        type: 'harness_packet',
        summary: `${pkt.packet_id} ${pkt.persona} → ${pkt.preferred_tool}.${pkt.preferred_action}`,
        status: pkt.packet_status,
        needs_review: pkt.review_required,
        review_focus: pkt.review_focus,
        payload: { ...pkt, dispatch_id },
      });
    }
  }

  return result;
}
