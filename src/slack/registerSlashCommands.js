/**
 * Bolt slash commands — `/g1cos`: 조회 + lineage (Council·LLM 없음).
 * All founder-facing text validated through founderOutbound.validateFounderText.
 * FOUNDERRAWOUTBOUND_FORBIDDEN — no raw text bypasses validation.
 */

import { normalizeSlackUserPayload } from './slackTextNormalize.js';
import { tryFinalizeSlackQueryRoute } from '../features/queryOnlyRoute.js';
import { tryFinalizeG1CosLineageTransport } from '../features/g1cosLineageTransport.js';
import { logRouterEvent } from '../features/topLevelRouter.js';
import { recordSlashCommandExchange } from '../features/slackConversationBuffer.js';
import { formatRuntimeMetaSurfaceText } from '../features/inboundFounderRoutingLock.js';
import { validateFounderText } from '../core/founderOutbound.js';

function safeText(text) {
  return validateFounderText(text).text;
}

export function registerG1CosSlashCommand(slackApp) {
  slackApp.command('/g1cos', async ({ ack, command, respond }) => {
    await ack();

    const rawArg = String(command.text || '').trim();
    const displayRaw = `/g1cos${rawArg ? ` ${rawArg}` : ''}`;
    const trimmed = normalizeSlackUserPayload(rawArg);
    const routerCtx = { raw_text: displayRaw, normalized_text: trimmed, slack_route_label: 'slash_finalize' };

    logRouterEvent('slash_command_entered', {
      command: '/g1cos',
      channel_id: command.channel_id,
      user_id: command.user_id,
      has_text: Boolean(rawArg),
    });

    const usageEphemeral = [
      '*G1 COS* `/g1cos` — **조회** + **lineage(M4)** (Council·LLM 없음)',
      '도움말: 인자 없음 · `help` · `도움말` · `사용법` · `?`',
      '',
      '*조회 예:*',
      '• `/g1cos 계획상세 PLN-…` · `/g1cos 업무상세 WRK-…` 등',
      '',
      '*lineage(감사·큐·trace):*',
      '• `/g1cos 턴 <uuid>` (`trace …`)',
      '• `/g1cos 패킷 PKT-…` (`packet …`)',
      '• `/g1cos 상태 STP-…` (`status …`) — 상태 패킷 감사',
      '• `/g1cos 워크큐 목록` · `/g1cos 워크큐 대기` (승인·대기 게이트)',
      '• `/g1cos 워크큐 AWQ-…` (`wq …`)',
      '',
      '그 외는 멘션/DM으로 `도움말` · `운영도움말` · `COS …` 등을 쓰세요.',
    ].join('\n');

    if (/^(?:version|버전|runtime\s*status)$/i.test(trimmed)) {
      const vText = safeText(formatRuntimeMetaSurfaceText());
      await respond({ response_type: 'in_channel', text: vText });
      recordSlashCommandExchange(command, displayRaw, vText);
      return;
    }

    const isSlashHelp = !trimmed || /^(help|도움말|사용법|\?)$/i.test(trimmed);
    if (isSlashHelp) {
      await respond({ response_type: 'ephemeral', text: usageEphemeral });
      recordSlashCommandExchange(command, displayRaw, usageEphemeral);
      return;
    }

    const lineageHit = await tryFinalizeG1CosLineageTransport(trimmed, routerCtx);
    if (lineageHit != null) {
      logRouterEvent('slack_interactive_route', { route: 'slash_lineage', response_type: lineageHit.response_type });
      logRouterEvent('slash_lineage_transport', {
        command: '/g1cos',
        response_type: lineageHit.response_type,
        channel_id: command.channel_id,
      });
      await respond({ response_type: 'in_channel', text: safeText(lineageHit.text) });
      recordSlashCommandExchange(command, displayRaw, lineageHit.text);
      return;
    }

    const finalized = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
    if (finalized == null) {
      const missText = [
        '`/g1cos` 는 현재 **위 조회 접두 + ID** 만 처리합니다.',
        `입력: \`${trimmed.slice(0, 200)}\``,
        '',
        usageEphemeral.split('\n').slice(0, 8).join('\n'),
      ].join('\n');
      await respond({ response_type: 'ephemeral', text: missText });
      recordSlashCommandExchange(command, displayRaw, missText);
      return;
    }

    logRouterEvent('slack_interactive_route', { route: 'slash_finalize', response_type: 'query' });
    logRouterEvent('slash_command_query_returned', {
      command: '/g1cos',
      channel_id: command.channel_id,
    });

    if (typeof finalized === 'object' && finalized?.blocks) {
      const outText = safeText(finalized.text || '');
      await respond({
        response_type: 'in_channel',
        text: outText,
        blocks: finalized.blocks,
      });
      recordSlashCommandExchange(command, displayRaw, outText);
    } else {
      const outText = safeText(typeof finalized === 'string' ? finalized : finalized?.text || '');
      await respond({
        response_type: 'in_channel',
        text: outText,
      });
      recordSlashCommandExchange(command, displayRaw, outText);
    }
  });
}
