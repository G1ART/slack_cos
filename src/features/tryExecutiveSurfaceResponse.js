/**
 * 대표 표면 intent → 즉시 응답 문자열 (LLM 없음).
 */

import { classifySurfaceIntent } from './surfaceIntentClassifier.js';
import {
  buildThinExecutiveStatusPacket,
  formatExecutiveStatusPacketSlack,
  appendStatusPacketAudit,
} from './statusPackets.js';
import {
  gatherExecutiveOperatingRollup,
  applyRollupToExecutiveStatusPacket,
} from './executiveStatusRollup.js';
import {
  buildThinDecisionPacket,
  formatDecisionPacketSlack,
  appendDecisionPacketAudit,
  saveThreadDecisionTail,
} from './decisionPackets.js';
import { buildSlackThreadKey } from './slackConversationBuffer.js';
import { appendCustomerFeedbackWithAwqDraft } from './customerFeedbackAwqBridge.js';
import { appendWorkspaceQueueItem } from './cosWorkspaceQueue.js';
import {
  promoteWorkspaceQueueSpecToPlan,
  formatWorkspaceQueuePromoteSlack,
} from './workspaceQueuePromote.js';
import { getDefaultEnvKey } from '../storage/environmentProfiles.js';
import { getEnvironmentContext } from '../storage/environmentContext.js';
import { buildStartProjectAlignmentSummary } from './startProjectSurfaceCopy.js';

function isFastSpecPromoteEnabled() {
  const v = String(process.env.COS_FAST_SPEC_PROMOTE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isStartProjectQueueFooterVerbose() {
  const v = String(process.env.COS_START_PROJECT_VERBOSE_QUEUE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * @param {Record<string, unknown>} metadata
 */
async function resolveEnvKeyForSurface(metadata) {
  let envKey = getDefaultEnvKey();
  try {
    const ch = metadata?.channel != null ? String(metadata.channel) : '';
    if (ch) {
      const fromCh = await getEnvironmentContext(ch);
      if (fromCh && String(fromCh).trim()) envKey = String(fromCh).trim();
    }
  } catch {
    /* ignore */
  }
  if (metadata?.env_key != null && String(metadata.env_key).trim()) {
    envKey = String(metadata.env_key).trim();
  }
  return envKey;
}

/**
 * @param {string} trimmed
 * @param {Record<string, unknown>} [metadata] thread tail·audit (없으면 결정 패킷만 문자열로 생성, 디스크 생략)
 * @param {{ startProjectToneAck?: string | null }} [surfaceOpts]
 * @returns {Promise<{ text: string, packet_id: string | null, status_packet_id?: string | null, response_type: string } | null>}
 */
export async function tryExecutiveSurfaceResponse(trimmed, metadata = undefined, surfaceOpts = undefined) {
  const hit = classifySurfaceIntent(trimmed);
  if (!hit) return null;

  switch (hit.intent) {
    case 'decision_compare': {
      const topic = hit.body || trimmed;
      const packet = buildThinDecisionPacket(topic);
      const text = formatDecisionPacketSlack(packet);
      if (metadata) {
        await appendDecisionPacketAudit(packet);
        await saveThreadDecisionTail(buildSlackThreadKey(metadata), packet);
      }
      return {
        text,
        packet_id: packet.packet_id,
        status_packet_id: null,
        response_type: 'decision_packet',
      };
    }
    case 'ask_status': {
      const rollup = await gatherExecutiveOperatingRollup();
      const base = buildThinExecutiveStatusPacket({
        intent: 'ask_status',
        note: rollup.has_operating_data
          ? 'AWQ·PLN·WRK 스토어 롤업 포함 (v1).'
          : '로컬 운영 객체 없음 — 실행·등록 후 동일 요청으로 롤업됩니다.',
      });
      const packet = applyRollupToExecutiveStatusPacket(base, rollup);
      if (metadata) {
        await appendStatusPacketAudit(packet);
      }
      return {
        text: formatExecutiveStatusPacketSlack(packet),
        packet_id: null,
        status_packet_id: packet.status_packet_id,
        response_type: 'ask_status',
      };
    }
    case 'product_feedback': {
      const g = hit.body || '';
      /** @type {string[]} */
      const lines = [
        '*[제품·서비스 피드백]*',
        '',
        g.trim()
          ? `_인입:_ ${g.slice(0, 800)}${g.length > 800 ? '…' : ''}`
          : '_내용을 한 줄로 적어 주세요. 예:_ `피드백: 로그인 후 첫 화면이 …`',
      ];
      if (metadata && typeof metadata === 'object' && g.trim()) {
        try {
          const { cfb: rec, awq, policy } = await appendCustomerFeedbackWithAwqDraft({
            body: g.trim(),
            metadata,
            channelContext: null,
          });
          lines.push(
            '',
            `*피드백 큐에 저장* — \`${rec.id}\` (고객 피드백)`,
            '',
            `*AWQ 초안* — \`${awq.id}\` · \`${awq.status}\` · 티어 \`${policy.tier}\``,
            ...(policy.note ? [`_정책:_ ${policy.note}`, ''] : ['']),
            `· 드릴다운: \`고객 피드백 ${rec.id}\` · \`워크큐 ${awq.id}\``,
            '· 목록: `고객 피드백 목록` / `워크큐 목록` — `지금 상태` 롤업',
            '',
            awq.status === 'pending_executive'
              ? `_다음:_ \`워크큐실행허가 ${awq.id}\` (대표 단일·향후 위임)_`
              : '_다음:_ WRK 연결·`커서발행` 등 운영 경로 (COS 게이트)._',
          );
        } catch {
          lines.push('', '_큐·AWQ 초안 저장에 실패했습니다. `고객피드백: …` 구조화 명령으로 다시 시도해 주세요._');
        }
      } else if (g.trim() && !metadata) {
        lines.push(
          '',
          '_슬랙 메타가 없어 파일 큐에는 남기지 않았습니다. 채널/DM에서 동일 문장을 보내면 traceable 저장됩니다._',
        );
      }
      return {
        text: lines.join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'product_feedback',
      };
    }
    case 'start_project': {
      const g = hit.body || '';
      const alignment = buildStartProjectAlignmentSummary(g, {
        toneAck: surfaceOpts?.startProjectToneAck ?? null,
      });
      /** @type {string[]} */
      const extra = [];
      if (metadata && typeof metadata === 'object' && g.trim()) {
        try {
          const rec = await appendWorkspaceQueueItem({
            kind: 'spec_intake',
            body: g.trim(),
            metadata,
            channelContext: null,
          });
          if (isStartProjectQueueFooterVerbose()) {
            extra.push(
              '',
              '*실행 큐에 적재* — 에이전트·Cursor 레이어가 이어갈 수 있는 JSON 인테이크',
              `\`CWS\`: \`${rec.id}\``,
              '',
              '*자동으로 PLN·WRK 만들기 (슬랙 한 줄)*',
              `\`실행큐계획화 ${rec.id}\` 또는 \`실행큐계획화 최근\``,
              '_이후 `커서발행 <WRK>`로 외부 Cursor에 넘기면 코딩 루프가 시작됩니다 (승인·환경 정책은 PLN 상태를 따름)._',
            );
            if (isFastSpecPromoteEnabled()) {
              try {
                const envKey = await resolveEnvKeyForSurface(metadata);
                const prom = await promoteWorkspaceQueueSpecToPlan({
                  queueId: rec.id,
                  metadata,
                  channelContext: null,
                  projectContext: null,
                  envKey,
                });
                if (prom.ok) {
                  extra.push(
                    '',
                    '---',
                    '_`COS_FAST_SPEC_PROMOTE` — 같은 턴에서 실행큐계획화 완료_',
                    '',
                    formatWorkspaceQueuePromoteSlack({
                      plan: prom.plan,
                      queueItem: prom.queueItem,
                    }),
                  );
                } else {
                  extra.push(
                    '',
                    `_자동 실행큐계획화 스킵:_ \`${prom.reason}\` — \`실행큐계획화 ${rec.id}\` 를 보내 주세요.`,
                  );
                }
              } catch (e) {
                const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
                extra.push('', `_자동 실행큐계획화 실패:_ ${msg} — \`실행큐계획화 ${rec.id}\``);
              }
            }
          } else {
            extra.push('', '_동일 킥오프 본문은 실행 정렬 큐에 남겼습니다. (APR 없음)_');
            if (isFastSpecPromoteEnabled()) {
              try {
                const envKey = await resolveEnvKeyForSurface(metadata);
                const prom = await promoteWorkspaceQueueSpecToPlan({
                  queueId: rec.id,
                  metadata,
                  channelContext: null,
                  projectContext: null,
                  envKey,
                });
                if (prom.ok) {
                  extra.push(
                    '',
                    '---',
                    '_`COS_FAST_SPEC_PROMOTE` — 같은 턴에서 실행큐계획화 완료_',
                    '',
                    formatWorkspaceQueuePromoteSlack({
                      plan: prom.plan,
                      queueItem: prom.queueItem,
                    }),
                  );
                } else {
                  extra.push(
                    '',
                    `_자동 실행큐계획화 스킵:_ \`${prom.reason}\` — 운영 구조화 경로로 재시도 가능.`,
                  );
                }
              } catch (e) {
                const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
                extra.push('', `_자동 실행큐계획화 실패:_ ${msg}`);
              }
            }
          }
        } catch {
          extra.push('', '_실행 큐 적재에 실패했습니다. `실행큐: …` 구조화 명령으로 다시 시도해 주세요._');
        }
      }
      return {
        text: [alignment, ...extra].join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'start_project',
      };
    }
    case 'hold_pause':
      return {
        text: [
          '*[보류·중단]*',
          '기록했습니다. (v0 — 추후 결정 패킷·PLN/WRK 상태와 자동 연동)',
          hit.body && hit.body !== trimmed ? `\n_메모:_ ${hit.body.slice(0, 400)}` : '',
          '',
          '재개할 때는 목표를 한 줄로 다시 말씀해 주시면 됩니다.',
        ]
          .filter(Boolean)
          .join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'hold_pause',
      };
    case 'request_deploy_readiness':
      return {
        text: [
          '*[배포·준비]*',
          'v0: 승인 매트릭스·환경 차원 정책은 **Phase 2**에서 formalize 됩니다.',
          '',
          '지금 할 일:',
          '- staging/검증 결과·PR·런 ID 등 **증거**를 남기면, “완료” 주장이 신뢰 가능해집니다 (제품 원칙).',
          '- 운영 측 점검은 `배포준비점검`·`환경점검` 등 **운영도움말** 경로를 쓸 수 있습니다.',
        ].join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'request_deploy_readiness',
      };
    case 'request_strategy_review': {
      const g = hit.body || '';
      return {
        text: [
          '*[전략 검토 · v0]*',
          g
            ? `_인입:_ ${g.slice(0, 500)}${g.length > 500 ? '…' : ''}`
            : '_범위·목표를 한 줄로(`전략 검토: …`) 적어 주시면 COS가 정리해 후속 패킷·계획으로 넘기기 쉽습니다._',
          '',
          '· **여러 관점·반대 시나리오**가 필요하면 → `협의모드: …` (Council, **옵트인**)',
          '· 실행·조회는 `계획등록:`·`계획상세` 등 **운영 어휘**(대표 도움말에 전부 안 적음)',
        ].join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'request_strategy_review',
      };
    }
    case 'request_risk_review': {
      const g = hit.body || '';
      return {
        text: [
          '*[리스크 검토 · v0]*',
          g
            ? `_인입:_ ${g.slice(0, 500)}${g.length > 500 ? '…' : ''}`
            : '_우려·한계를 한 줄로(`리스크 검토: …`) 적어 주세요._',
          '',
          '· **정식 다각 리스크·완화 논의**는 → `협의모드: …`',
          '· 증거·완료 정의는 제품 원칙: run/PR/테스트 등 **proof_refs** 를 붙이면 신뢰도가 올라갑니다.',
        ].join('\n'),
        packet_id: null,
        status_packet_id: null,
        response_type: 'request_risk_review',
      };
    }
    default:
      return null;
  }
}
