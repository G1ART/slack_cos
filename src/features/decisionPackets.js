/**
 * M2b — decision packet schema, Slack render, short-reply parse (thin slice).
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md §11
 */

import fs from 'fs/promises';
import path from 'path';
import {
  resolveDecisionPacketsJsonlPath,
  resolveThreadDecisionTailPath,
} from '../storage/paths.js';
import { evaluateApprovalPolicy } from './approvalMatrixStub.js';
import { buildSlackThreadKey } from './slackConversationBuffer.js';
import { getEnvironmentContext } from '../storage/environmentContext.js';
import { getDefaultEnvKey, getEnvironmentProfile } from '../storage/environmentProfiles.js';
import { enqueueFromDecisionPick, formatAgentWorkQueueSlackLine } from './agentWorkQueue.js';

/**
 * @typedef {{
 *   option_id: string,
 *   title: string,
 *   short_description: string,
 *   tradeoffs: string,
 *   estimated_cost: string,
 *   estimated_time: string,
 *   reversibility: string,
 *   risk_level: 'low'|'medium'|'high',
 *   rank_speed: number,
 *   rank_cost: number,
 * }} DecisionOption
 */

/**
 * @typedef {{
 *   packet_id: string,
 *   topic: string,
 *   context_summary: string,
 *   options: DecisionOption[],
 *   recommended_option_id: string,
 *   recommendation_reason: string,
 *   approval_required: boolean,
 *   consequence_of_delay: string,
 *   suggested_reply_examples: string[],
 *   linked_plan_ids: string[],
 *   linked_work_ids: string[],
 *   linked_run_ids: string[],
 *   generated_at: string,
 * }} DecisionPacket
 */

export function createDecisionPacketId() {
  return `PKT-${crypto.randomUUID()}`;
}

/**
 * @param {string} topic
 * @returns {DecisionPacket}
 */
export function buildThinDecisionPacket(topic) {
  const t = String(topic || '').trim() || '(주제 없음)';
  /** @type {DecisionOption[]} */
  const options = [
    {
      option_id: 'opt_1',
      title: '1안 — 빠른 롤아웃',
      short_description: '핵심만 넣고 짧은 주기로 출시',
      tradeoffs: '범위를 줄이면 리스크는 낮지만 후속 반복이 필요할 수 있음',
      estimated_cost: '중',
      estimated_time: '단기(예: 1~2주)',
      reversibility: '높음',
      risk_level: 'low',
      rank_speed: 1,
      rank_cost: 2,
    },
    {
      option_id: 'opt_2',
      title: '2안 — 범위 확장 후 출시',
      short_description: '요구를 더 담아 한 번에 맞추는 쪽',
      tradeoffs: '준비·검증이 길어질 수 있음',
      estimated_cost: '중~상',
      estimated_time: '중기(예: 3~6주)',
      reversibility: '중간',
      risk_level: 'high',
      rank_speed: 2,
      rank_cost: 1,
    },
  ];
  return {
    packet_id: createDecisionPacketId(),
    topic: t,
    context_summary: '대표 표면에서 요약된 결정 비교(v0). 저장소·PLN 연동은 후속.',
    options,
    recommended_option_id: 'opt_1',
    recommendation_reason: '불확실성이 있을 때는 검증 사이클을 짧게 가져가는 편이 안전한 경우가 많습니다(팀 맥락 없는 기본 추천).',
    approval_required: true,
    consequence_of_delay: '검증·우선순위 신호가 늦어질 수 있습니다.',
    suggested_reply_examples: ['1안', '2안', '2안으로 가자', '더 빠른 쪽', '비용 적은 쪽', '보류'],
    linked_plan_ids: [],
    linked_work_ids: [],
    linked_run_ids: [],
    generated_at: new Date().toISOString(),
  };
}

/**
 * @param {DecisionPacket} packet
 */
export function formatDecisionPacketSlack(packet) {
  const optLines = packet.options.map((o, i) => {
    const n = i + 1;
    return [
      `*${n}안 · ${o.title.replace(/^\d+안\s*[—\-]\s*/u, '')}* (\`${o.option_id}\`)`,
      `_한 줄:_ ${o.short_description}`,
      `_트레이드오프:_ ${o.tradeoffs}`,
      `_비용·기간·되돌리기:_ ${o.estimated_cost} · ${o.estimated_time} · ${o.reversibility} · 위험 ${o.risk_level}`,
    ].join('\n');
  });

  const sug = packet.suggested_reply_examples.map((s) => `\`${s}\``).join(', ');

  return [
    '*[결정 패킷 · v0]*',
    '',
    `*주제:* ${packet.topic}`,
    `*맥락:* ${packet.context_summary}`,
    '',
    '*선택지:*',
    ...optLines.flatMap((b) => ['', b]),
    '',
    `*COS 추천:* ${packet.recommended_option_id} — ${packet.recommendation_reason}`,
    '',
    `*승인 필요:* ${packet.approval_required ? '예 — 티어는 활성 **환경 프로필**·선택지 **위험도/비용/되돌리기**로 산출(v1)' : '아니오'}`,
    `*지연 시:* ${packet.consequence_of_delay}`,
    '',
    '*짧은 회신 예:* ' + sug,
    '',
    `\`packet_id\`: \`${packet.packet_id}\``,
  ].join('\n');
}

/**
 * @param {string} text trimmed normalized user text
 * @param {DecisionPacket | null} packet
 * @returns {{ kind: 'pick'|'defer'|'unknown', option_id?: string, note?: string }}
 */
export function parseDecisionShortReply(text, packet) {
  const raw = String(text || '').trim();
  if (!packet || !raw) return { kind: 'unknown' };

  if (/^(보류|hold|나중에|pending)/iu.test(raw) || /^이건\s*보류/iu.test(raw)) {
    return { kind: 'defer', note: raw };
  }

  if (/1\s*안|일\s*안|첫\s*안|^안\s*1|one|first/iu.test(raw)) {
    const o = packet.options.find((x) => x.option_id === 'opt_1') || packet.options[0];
    return o ? { kind: 'pick', option_id: o.option_id } : { kind: 'unknown' };
  }
  if (/2\s*안|이\s*안|둘째|두\s*번째|^안\s*2|second/iu.test(raw)) {
    const o = packet.options.find((x) => x.option_id === 'opt_2') || packet.options[1];
    return o ? { kind: 'pick', option_id: o.option_id } : { kind: 'unknown' };
  }

  if (/빠른|빠르|단기|속도/iu.test(raw)) {
    const sorted = [...packet.options].sort((a, b) => a.rank_speed - b.rank_speed);
    const o = sorted[0];
    return o ? { kind: 'pick', option_id: o.option_id, note: 'faster_preference' } : { kind: 'unknown' };
  }

  if (/비용|저렴|적은|낮은/iu.test(raw) && !/높은/iu.test(raw)) {
    const sorted = [...packet.options].sort((a, b) => a.rank_cost - b.rank_cost);
    const o = sorted[0];
    return o ? { kind: 'pick', option_id: o.option_id, note: 'cheaper_preference' } : { kind: 'unknown' };
  }

  return { kind: 'unknown' };
}

/**
 * @param {DecisionPacket} packet
 */
export async function appendDecisionPacketAudit(packet) {
  const fp = resolveDecisionPacketsJsonlPath();
  const line = `${JSON.stringify({ type: 'decision_packet', recorded_at: new Date().toISOString(), ...packet })}\n`;
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, line, 'utf8');
}

/**
 * @param {string} threadKey
 * @param {DecisionPacket} packet
 */
export async function saveThreadDecisionTail(threadKey, packet) {
  const fp = resolveThreadDecisionTailPath();
  let map = {};
  try {
    const raw = await fs.readFile(fp, 'utf8');
    map = JSON.parse(raw);
    if (typeof map !== 'object' || map === null) map = {};
  } catch {
    map = {};
  }
  map[threadKey] = {
    packet_id: packet.packet_id,
    updated_at: new Date().toISOString(),
    packet,
  };
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(map, null, 2), 'utf8');
}

/**
 * @param {string} threadKey
 * @returns {Promise<DecisionPacket | null>}
 */
export async function loadThreadDecisionTail(threadKey) {
  try {
    const raw = await fs.readFile(resolveThreadDecisionTailPath(), 'utf8');
    const map = JSON.parse(raw);
    const row = map[threadKey];
    if (row?.packet) return row.packet;
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string} trimmed
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{ text: string, packet_id: string | null, work_queue_id?: string | null, response_type: string } | null>}
 */
async function resolveApprovalEnvKey(metadata) {
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

export async function tryFinalizeDecisionShortReply(trimmed, metadata) {
  const threadKey = buildSlackThreadKey(metadata);
  const packet = await loadThreadDecisionTail(threadKey);
  const parsed = parseDecisionShortReply(trimmed, packet);
  if (parsed.kind === 'unknown') return null;

  const packetId = packet?.packet_id ?? null;
  const envKey = await resolveApprovalEnvKey(metadata);
  const envProfile = await getEnvironmentProfile(envKey);

  if (parsed.kind === 'defer') {
    const policy = evaluateApprovalPolicy({
      action_type: 'decision_defer',
      environment_key: envKey,
      env_profile_risk: envProfile.risk_level,
    });
    const text = [
      '*[결정 회신]*',
      '`보류`로 기록했습니다.',
      packetId ? `\`packet_id\`: \`${packetId}\`` : '',
      `*승인 정책(M2b 매트릭스 v1):* \`${policy.tier}\` — ${policy.note}`,
    ]
      .filter(Boolean)
      .join('\n');
    return { text, packet_id: packetId, work_queue_id: null, response_type: 'decision_reply_defer' };
  }

  const opt = packet?.options?.find((o) => o.option_id === parsed.option_id);
  const policy = evaluateApprovalPolicy({
    action_type: 'decision_pick',
    environment_key: envKey,
    env_profile_risk: envProfile.risk_level,
    selected_option: opt ?? null,
  });

  let workQueueId = null;
  if (packetId && parsed.option_id) {
    const q = await enqueueFromDecisionPick({
      packet_id: packetId,
      option_id: parsed.option_id,
      topic: packet?.topic ?? null,
      thread_key: threadKey,
      interpretation_note: parsed.note ?? null,
      linked_plan_ids: packet?.linked_plan_ids,
      linked_work_ids: packet?.linked_work_ids,
      linked_run_ids: packet?.linked_run_ids,
      approval_policy_tier: policy.tier,
      slack_source: {
        channel: metadata.channel,
        user: metadata.user,
        ts: metadata.ts,
        source_type: metadata.source_type,
      },
    });
    workQueueId = q.id;
  }

  const text = [
    '*[결정 회신]*',
    `선택: \`${parsed.option_id}\`${opt ? ` — ${opt.title}` : ''}`,
    parsed.note ? `_해석:_ ${parsed.note}` : '',
    packetId ? `\`packet_id\`: \`${packetId}\`` : '',
    `*승인 정책(M2b 매트릭스 v1):* \`${policy.tier}\` — ${policy.note}`,
    '',
    workQueueId
      ? formatAgentWorkQueueSlackLine({ id: workQueueId, status: 'queued' })
      : '_워크 큐 기록 skipped (packet_id 없음)._',
  ]
    .filter(Boolean)
    .join('\n');

  return { text, packet_id: packetId, work_queue_id: workQueueId, response_type: 'decision_reply_pick' };
}
