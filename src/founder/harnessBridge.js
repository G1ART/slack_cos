/**
 * COS 뒤 Harness — org-shape dispatch artifact + execution ledger (founder 비노출).
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from './executionLedger.js';

const PERSONA_ENUM = new Set(['research', 'pm', 'engineering', 'design', 'qa', 'data']);

/** @type {Record<string, { purpose: string, typical_deliverables: string[] }>} */
export const PERSONA_REGISTRY = {
  research: {
    purpose: '시장·경쟁·근거 조사와 불확실성 정리',
    typical_deliverables: ['리서치 메모', '가정 목록', '근거 링크'],
  },
  pm: {
    purpose: '범위·우선순위·성공 기준과 이해관계자 정합',
    typical_deliverables: ['요구 요약', 'MVP 범위', '릴리즈 기준'],
  },
  engineering: {
    purpose: '구현·아키텍처·품질과 기술 리스크',
    typical_deliverables: ['기술 설계', '태스크 분해', '구현 노트'],
  },
  design: {
    purpose: 'UX·정보 구조·접근성과 일관된 경험',
    typical_deliverables: ['플로우', '와이어', 'UI 가이드'],
  },
  qa: {
    purpose: '검증·회귀·엣지 케이스와 출시 전 품질 게이트',
    typical_deliverables: ['테스트 플랜', '버그 리스트', '사인오프'],
  },
  data: {
    purpose: '지표·파이프라인·실험과 데이터 계약',
    typical_deliverables: ['지표 정의', '쿼리/스키마 메모', '대시보드 초안'],
  },
};

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
    next_step: 'cursor_spec_emit',
  };

  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'harness_dispatch',
      summary: `${dispatch_id} ${objective.slice(0, 120)}`,
      payload: { ...result },
    });
  }

  return result;
}
