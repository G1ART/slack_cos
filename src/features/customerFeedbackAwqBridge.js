/**
 * 고객 피드백(CFB) 적재 후 AWQ 초안 + 큐 행 연결 (대표 정책: COS 티어 v1).
 */

import {
  appendWorkspaceQueueItem,
  patchWorkspaceQueueItem,
  formatWorkspaceQueueSaved,
} from './cosWorkspaceQueue.js';
import { enqueueFromCustomerFeedback } from './agentWorkQueue.js';
import { evaluateApprovalPolicy } from './approvalMatrixStub.js';
import { getEnvironmentContext } from '../storage/environmentContext.js';
import { getDefaultEnvKey, getEnvironmentProfile } from '../storage/environmentProfiles.js';
import { buildSlackThreadKey } from './slackConversationBuffer.js';

/**
 * @param {Record<string, unknown>} metadata
 */
async function resolveEnvKeyForIntake(metadata) {
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
 * @param {object} p
 * @param {string} p.body
 * @param {Record<string, unknown>} p.metadata
 * @param {object|null} [p.channelContext]
 * @returns {Promise<{ cfb: object, awq: object, policy: ReturnType<typeof evaluateApprovalPolicy> }>}
 */
export async function appendCustomerFeedbackWithAwqDraft({ body, metadata, channelContext }) {
  const raw = String(body || '').trim();
  const cfb = await appendWorkspaceQueueItem({
    kind: 'customer_feedback',
    body: raw,
    metadata,
    channelContext: channelContext ?? null,
  });

  const envKey = await resolveEnvKeyForIntake(metadata);
  const envProfile = await getEnvironmentProfile(envKey);
  const policy = evaluateApprovalPolicy({
    action_type: 'customer_feedback_intake',
    environment_key: envKey,
    env_profile_risk: envProfile.risk_level,
  });

  const threadKey = buildSlackThreadKey(metadata);
  const awq = await enqueueFromCustomerFeedback({
    source_cfb_id: cfb.id,
    body: raw,
    title: cfb.title,
    thread_key: threadKey,
    approval_policy_tier: policy.tier,
    slack_source: {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      feedback_policy_note: policy.note,
      environment_key: envKey,
    },
  });

  const patchedCfb = await patchWorkspaceQueueItem(cfb.id, { linked_awq_id: awq.id });
  const cfbOut = patchedCfb ?? { ...cfb, linked_awq_id: awq.id };

  return { cfb: cfbOut, awq, policy };
}

/**
 * @param {{ cfb: object, awq: object, policy: { tier: string, note: string } }} p
 */
export function formatCustomerFeedbackIntakeComplete(p) {
  const { cfb, awq, policy } = p;
  const gate =
    awq.status === 'pending_executive'
      ? `· 먼저: \`워크큐실행허가 ${awq.id}\` (대표 단일 승인 주체·향후 위임 가능)`
      : '· COS 게이트(queued) — 작업 연결 후 실행 진행 가능';
  return [
    formatWorkspaceQueueSaved(cfb),
    '',
    '*AWQ 초안 (피드백 → 실행)*',
    `- \`${awq.id}\` · 상태 \`${awq.status}\` · 티어 \`${policy.tier}\``,
    policy.note ? `_정책:_ ${policy.note}` : null,
    '',
    gate,
    `- 드릴다운: \`워크큐 ${awq.id}\` · 피드백: \`고객 피드백 ${cfb.id}\``,
  ]
    .filter(Boolean)
    .join('\n');
}
