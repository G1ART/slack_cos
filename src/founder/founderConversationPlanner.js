/**
 * vNext.13.4 — COS 대화 턴: 자연어 응답 + 기계-readable sidecar (regex로 의미 분류하지 않음).
 * vNext.13.6 — durable_state.latest_file_contexts 는 Slack 파일 인테이크 전용(실행·승인과 분리).
 * vNext.13.7 — natural_language_reply 는 창업자에게 보일 **평문만** (내부 필드명·패킷 목차 금지).
 */

import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import { SAFE_FALLBACK_TEXT } from '../core/founderContracts.js';
import {
  FOUNDER_CONVERSATION_PLANNER_SCHEMA,
  normalizePlannerRow,
  emptySidecarFromPartner,
} from './founderArtifactSchemas.js';

const PLANNER_INSTRUCTIONS = `
당신은 G1.ART COS 내부 플래너다. 입력으로 대표 메시지와 컨텍스트 JSON이 주어진다.
반드시 스키마에 맞는 JSON 한 객체만 출력한다 (추가 텍스트 없음).

규칙:
- natural_language_reply: **슬랙 표면에는 쓰이지 않음**(내부 sidecar·검증용). 짧은 한국어 한 줄이면 충분. 목차·페르소나·Council 형식 금지.
- conversation_status: 대화 단계를 정직하게 표시한다.
- proposal_artifact: 제안·범위 정리에 쓸 구조화 힌트(없으면 빈 객체).
- approval_artifact: 외부 툴 실행이 필요하면 requires_external_dispatch 등을 채운다. 불필요하면 빈 객체.
- execution_artifact: **실행 스파인(런)을 새로 붙이려면** 반드시 채운다. 그렇지 않으면 빈 객체 {}.
  - request_execution_spine === true 일 때만 스파인 요청으로 간주한다.
  - goal_line, locked_scope_summary 필수.
  - source_proposal_artifact_id / source_approval_artifact_id 는 반드시 아래 state·아티팩트의 _cos_artifact_id 와 동일한 문자열이어야 한다 (자기주장 불충분).
- proposal_artifact / approval_artifact 에 안정 id가 필요하면 _cos_artifact_id 에 짧은 고유 문자열을 둔다.
- state_delta: durable state — 실행 요청 시 최소 포함 후보: latest_proposal_artifact_id, latest_approval_artifact_id, last_founder_confirmation_at (ISO), last_founder_confirmation_kind, approval_lineage_status(확정 시 confirmed).
- durable_state.latest_file_contexts / contextFrame.recent_file_contexts: Slack 첨부(DOCX/PDF/PNG 등) 자동 인테이크 기록. **실행·승인 아티팩트와 혼동하지 말 것.** 파일만으로는 제안/승인 확정을 추정하지 말 것.
- contextFrame.slack_attachment_failure_notes: 첨부 **실패** 요약(한국어). user_message 에는 넣지 말 것. **natural_language_reply 는 내부 기록용**이며 대표 슬랙 표면에는 다른 경로(단일 COS 대화 모델)가 쓴다.
- follow_up_questions: 필요 시 되물음.
`.trim();

/**
 * @param {{
 *   userText: string,
 *   contextJson: string,
 *   priorTranscript?: string,
 *   callText?: ((a: { instructions: string, input: string }) => Promise<string>) | null,
 *   callJSON?: ((a: { instructions: string, input: string, schemaName: string, schema: object }) => Promise<unknown>) | null,
 *   mockPlannerRow?: Record<string, unknown> | null,
 * }} args
 */
export async function planFounderConversationTurn(args) {
  const { userText, contextJson, priorTranscript = '', callText, callJSON, mockPlannerRow } = args;

  if (mockPlannerRow && typeof mockPlannerRow === 'object') {
    const n = normalizePlannerRow(mockPlannerRow);
    if (n.ok && n.sidecar) {
      return {
        sidecar: n.sidecar,
        source: 'mock',
        structured_output_sanitized: false,
      };
    }
  }

  if (typeof callJSON === 'function') {
    try {
      const row = await callJSON({
        instructions: PLANNER_INSTRUCTIONS,
        input: JSON.stringify(
          { user_message: String(userText || '').slice(0, 12000), founder_context: contextJson },
          null,
          0,
        ),
        schemaName: 'founder_conversation_planner',
        schema: FOUNDER_CONVERSATION_PLANNER_SCHEMA,
      });
      const n = normalizePlannerRow(row);
      if (n.ok && n.sidecar) {
        return {
          sidecar: n.sidecar,
          source: 'structured_llm',
          structured_output_sanitized: false,
        };
      }
    } catch (e) {
      console.error('[FOUNDER_CONVERSATION_PLANNER_JSON]', e?.message || e);
    }
  }

  if (typeof callText === 'function') {
    const natural = await runCosNaturalPartner({
      callText,
      userText,
      channelContext: null,
      route: { primary_agent: 'founder_kernel', include_risk: false, urgency: 'normal' },
      priorTranscript,
    });
    const raw = String(natural || '').trim();
    const { text: sanitized, stripped_to_empty } = sanitizePartnerNaturalLlmOutput(raw);
    return {
      sidecar: emptySidecarFromPartner(sanitized),
      source: 'partner_fallback_no_sidecar',
      partner_output_sanitized: raw !== sanitized || stripped_to_empty,
      structured_output_sanitized: false,
    };
  }

  return {
    sidecar: emptySidecarFromPartner(
      'COS 응답 경로가 구성되지 않았습니다. 운영 환경에서 대화 모델 연결을 확인해 주세요.',
    ),
    source: 'empty',
    structured_output_sanitized: false,
  };
}
