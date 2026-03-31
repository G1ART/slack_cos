/**
 * Query-only Slack commands — storage + formatter only, Council 금지.
 * @see docs/cursor-handoffs/Query_Commands_Council_Free_handoff.md
 */

import { getStoreCore } from '../storage/core/index.js';
import {
  getPlan,
  listRecentPlansForAlias,
  formatPlanDetail,
  formatPlanProgressSlack,
  buildPlanDispatchSlackBody,
} from './plans.js';
import { getWorkItem, formatWorkItemDetailQuery } from './workItems.js';
import { formatWorkReviewQuery } from './workLifecycle.js';
import { getLatestRunByWorkId, getLatestCursorRunForWork } from './workRuns.js';
import { normalizeSlackUserPayload } from '../slack/slackTextNormalize.js';
import { stripSlackMarkupArtifacts } from '../slack/inboundText.js';
import { finalizeSlackResponse, logRouterEvent } from './topLevelRouter.js';
import { wrapQueryFinalizePlainText } from '../slack/queryResponseBlocks.js';
import { logCosToolRegistryBind } from './cosToolTelemetry.js';
import {
  PREFIX_KIND,
  QUERY_PREFIXES,
  matchQueryCommandPrefix,
  parseCommandToken,
} from './queryCommandPrefix.js';

export { matchQueryCommandPrefix, parseCommandToken } from './queryCommandPrefix.js';

/**
 * Slack rich_text 가 글자 단위로 쪼개지면 `계 획 상 세 PLN-1` 처럼 들어와 startsWith/인라인 매칭이 전부 실패함.
 * 알려진 조회 접두만 글자 사이 임의 공백을 접어 복구한다.
 * @param {string} line
 */
function collapseSpacedHangulQueryPrefixes(line) {
  let t = String(line || '');
  for (const cmd of QUERY_PREFIXES) {
    const pattern = cmd
      .split('')
      .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s*');
    t = t.replace(new RegExp(pattern, 'g'), cmd);
  }
  return t;
}

/**
 * 문자열 **어디에나** 붙은 `계획상세 PLN-…` 형태를 잡는다 (줄 시작·startsWith 실패 시 Council 로 새는 경우).
 * 접두는 긴 것부터(계획발행목록 > 계획상세 …) alternation 순서 유지.
 */
function extractInlineQueryCommand(fullText) {
  const t = collapseSpacedHangulQueryPrefixes(String(fullText || '').trim());
  if (!t) return null;
  const alt = QUERY_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  // ID 앞 공백 생략(계획상세PLN-1)·rich_text 잔여 NBSP 등 허용
  // Slack이 "COS"+"계획진행" 노드를 공백 없이 이어붙이면 기존 [\s>]만으로는 실패 → Council/legacy 로 새었음
  const sep = '(?:^|[\\r\\n\\s\\u00A0\\u3000>]|(?<=[A-Za-z0-9]))';
  const flags = 'u';
  let re = new RegExp(`${sep}(${alt})\\s*(\\S+)`, flags);
  let m = t.match(re);
  if (!m) {
    try {
      re = new RegExp(`${sep}(${alt})\\s*(\\S+)`, '');
      m = t.match(re);
    } catch {
      m = null;
    }
  }
  if (!m) return null;
  return `${m[1]} ${m[2]}`;
}

/**
 * 멀티라인 입력에서 조회 명령 추출.
 * normalizeSlackCommandDecorations 가 **첫 줄만** 장식 제거하므로, 둘째 줄 이후의 `*계획상세*` 등은
 * 전체 문자열 startsWith 로는 절대 매칭되지 않아 Council 로 새는 root cause 가 된다.
 * 한 줄이라도 **앞에 멘션/맥락 문장**이 붙으면 startsWith 실패 → 인라인 스캔으로 복구.
 * @returns {string|null} handleQueryOnlyCommands 에 넘길 한 줄(또는 동일 전체), 없으면 null
 */
export function extractQueryCommandLine(fullNormalizedText) {
  const stripped = stripSlackMarkupArtifacts(String(fullNormalizedText || '').trim());
  const full = collapseSpacedHangulQueryPrefixes(normalizeSlackUserPayload(stripped));
  if (!full) return null;
  if (matchQueryCommandPrefix(full)) return full;
  for (const rawLine of full.split(/\r?\n/)) {
    const line = rawLine.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!line) continue;
    const n = collapseSpacedHangulQueryPrefixes(normalizeSlackUserPayload(line));
    if (matchQueryCommandPrefix(n)) return n;
    const inline = extractInlineQueryCommand(n);
    if (inline) return normalizeSlackUserPayload(inline);
  }
  const fallback = extractInlineQueryCommand(full);
  if (fallback) return normalizeSlackUserPayload(fallback);
  return null;
}

/**
 * `협의모드: …` 등으로 들어왔을 때 질문 부분이 **조회 한 줄만**이면 Council 대신 조회로 보낸다.
 * (예: 협의모드: 계획상세 PLN-1 — 사실상 조회 의도)
 * @param {string} questionFromCouncil parseCouncilCommand 의 question
 */
export function isStructuredQueryOnlyLine(questionFromCouncil) {
  const q = normalizeSlackUserPayload(String(questionFromCouncil || '').trim());
  if (!q) return false;
  const resolved = extractQueryCommandLine(q);
  if (!resolved) return false;
  const pref = matchQueryCommandPrefix(resolved);
  if (!pref) return false;
  if (!parseCommandToken(resolved, pref)) return false;
  return resolved.replace(/\s+/g, ' ') === q.replace(/\s+/g, ' ');
}

function resolveSourceUsed() {
  try {
    const s = getStoreCore();
    return `read_pref:${s.storage_read_preference}|storage_mode:${s.storage_mode}|supabase_cfg:${s.supabase_configured ? 'yes' : 'no'}`;
  } catch {
    return 'read_pref:unknown';
  }
}

function logQuery(event, fields) {
  console.info(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}

/**
 * @returns {Promise<string|null>} 응답 문자열 또는 null(해당 없음)
 */
export async function handleQueryOnlyCommands(trimmed) {
  let prefix = null;
  for (const p of QUERY_PREFIXES) {
    if (trimmed.startsWith(p)) {
      prefix = p;
      break;
    }
  }
  if (!prefix) return null;

  /** @type {QueryRouteKind} */
  const query_route_kind = PREFIX_KIND[prefix];
  const command_name = prefix;
  const base = () => ({
    command_name,
    query_route_kind,
    council_blocked: true,
    source_used: resolveSourceUsed(),
  });

  const token = parseCommandToken(trimmed, prefix);
  logQuery('query_route_entered', {
    ...base(),
    target_id: token || null,
  });

  if (!token) {
    logQuery('query_route_usage_error', {
      ...base(),
      target_id: null,
      response_type: 'usage_error',
    });
    logQuery('query_route_council_blocked', { ...base(), target_id: null });
    if (prefix === '계획상세') return '[계획상세] 형식: 계획상세 <PLN-...|번호>';
    if (prefix === '계획진행') return '[계획진행] 형식: 계획진행 <PLN-...|번호>';
    if (prefix === '계획발행목록') return '[계획발행목록] 형식: 계획발행목록 <PLN-...|번호>';
    if (prefix === '업무상세') return '[업무상세] 형식: 업무상세 <WRK-...|번호>';
    if (prefix === '업무검토') return '[업무검토] 형식: 업무검토 <WRK-...|번호>';
    return `${prefix} <id>`;
  }

  if (prefix === '계획상세' || prefix === '계획발행목록' || prefix === '계획진행') {
    await listRecentPlansForAlias(40);
    const plan = await getPlan(token);

    if (!plan) {
      logQuery('query_route_not_found', {
        ...base(),
        target_id: token,
        response_type: 'not_found',
      });
      logQuery('query_route_council_blocked', { ...base(), target_id: token });
      if (prefix === '계획상세') return `[계획상세] plan을 찾지 못했습니다: ${token}`;
      if (prefix === '계획진행') return `[계획진행] plan을 찾지 못했습니다: ${token}`;
      return `[계획발행목록] plan을 찾지 못했습니다: ${token}`;
    }

    const ids = plan.linked_work_items || [];
    const emptyState = ids.length === 0;
    let text;

    if (prefix === '계획상세') {
      text = await formatPlanDetail(plan, { queryContract: true });
    } else if (prefix === '계획진행') {
      text = await formatPlanProgressSlack(plan);
    } else {
      text = await buildPlanDispatchSlackBody(plan, {
        title: `[계획발행목록] ${plan.plan_id}`,
        queryDispatchList: true,
      });
    }

    const response_type =
      emptyState && (prefix === '계획상세' || prefix === '계획발행목록') ? 'empty_state' : 'structured_query';
    logQuery('query_route_response_rendered', {
      ...base(),
      target_id: token,
      response_type,
    });
    logQuery('query_route_council_blocked', { ...base(), target_id: token });
    return text;
  }

  if (prefix === '업무상세') {
    const item = await getWorkItem(token);
    if (!item) {
      logQuery('query_route_not_found', {
        ...base(),
        target_id: token,
        response_type: 'not_found',
      });
      logQuery('query_route_council_blocked', { ...base(), target_id: token });
      return `[업무상세] work를 찾지 못했습니다: ${token}\n- 형식: 업무상세 <WRK-...|번호>`;
    }
    const plan = item.source_plan_id ? await getPlan(item.source_plan_id) : null;
    const latestRun = await getLatestRunByWorkId(item.id);
    const latestCursorRun = await getLatestCursorRunForWork(item.id);
    const text = formatWorkItemDetailQuery(item, { plan, latestRun, latestCursorRun });
    logQuery('query_route_response_rendered', {
      ...base(),
      target_id: token,
      response_type: 'structured_query',
    });
    logQuery('query_route_council_blocked', { ...base(), target_id: token });
    return text;
  }

  if (prefix === '업무검토') {
    const item = await getWorkItem(token);
    if (!item) {
      logQuery('query_route_not_found', {
        ...base(),
        target_id: token,
        response_type: 'not_found',
      });
      logQuery('query_route_council_blocked', { ...base(), target_id: token });
      return `[업무검토] work를 찾지 못했습니다: ${token}\n- 형식: 업무검토 <WRK-...|번호>`;
    }
    const plan = item.source_plan_id ? await getPlan(item.source_plan_id) : null;
    const latestRun = await getLatestRunByWorkId(item.id);
    const latestCursorRun = await getLatestCursorRunForWork(item.id);
    const text = formatWorkReviewQuery(item, plan, latestRun, latestCursorRun);
    logQuery('query_route_response_rendered', {
      ...base(),
      target_id: token,
      response_type: 'structured_query',
    });
    logQuery('query_route_council_blocked', { ...base(), target_id: token });
    return text;
  }

  return null;
}

/**
 * 조회 명령이면 finalize까지 한 Slack 문자열을 반환. app.js 상단·runInboundAiRouter 방어선에서 공통 사용.
 * @param {string} trimmed `normalizeSlackUserPayload` 결과
 * @param {{ raw_text: unknown, normalized_text: string, slack_route_label?: string | null }} routerCtx
 * @returns {Promise<string | { text: string, blocks: object[] } | null>}
 */
export async function tryFinalizeSlackQueryRoute(trimmed, routerCtx) {
  const prepped = normalizeSlackUserPayload(stripSlackMarkupArtifacts(String(trimmed ?? '').trim()));
  let queryLineResolved = extractQueryCommandLine(prepped);
  if (!queryLineResolved) {
    const collapsed = collapseSpacedHangulQueryPrefixes(prepped);
    const inline = extractInlineQueryCommand(collapsed);
    queryLineResolved = inline ? normalizeSlackUserPayload(inline) : prepped;
  }
  let effectiveLine = queryLineResolved;
  let queryOnlyAnswer = await handleQueryOnlyCommands(queryLineResolved);
  if (queryOnlyAnswer == null && queryLineResolved !== prepped) {
    queryOnlyAnswer = await handleQueryOnlyCommands(prepped);
    if (queryOnlyAnswer != null) effectiveLine = prepped;
  }
  if (queryOnlyAnswer == null) return null;

  const queryPrefixSync = matchQueryCommandPrefix(effectiveLine);
  if (queryPrefixSync) {
    logRouterEvent('router_responder_selected', {
      responder: 'query',
      command_name: queryPrefixSync,
      query_match: true,
    });
    logRouterEvent('router_responder_locked', { responder: 'query', command_name: queryPrefixSync });
    logRouterEvent('query_route_entered', {
      command_name: queryPrefixSync,
      normalized_text: String(trimmed).slice(0, 400),
      council_blocked: true,
    });
  }

  const qCmd = queryPrefixSync || 'query';
  let response_type = 'structured_query';
  if (queryOnlyAnswer.includes('형식:')) response_type = 'usage_error';
  else if (queryOnlyAnswer.includes('찾지 못했습니다')) response_type = 'not_found';
  if (response_type === 'usage_error') logRouterEvent('usage_error_returned', { command_name: qCmd });
  if (response_type === 'not_found') logRouterEvent('not_found_returned', { command_name: qCmd });
  logRouterEvent('query_route_returned', {
    command_name: qCmd,
    response_type,
  });

  logCosToolRegistryBind({
    tool_id: 'plan_query',
    pipeline: 'pre_ai_query',
    command_name: qCmd,
    response_type,
  });

  const queryTargetId =
    queryPrefixSync != null ? parseCommandToken(effectiveLine, queryPrefixSync) : null;

  const plain = finalizeSlackResponse({
    responder: 'query',
    text: queryOnlyAnswer,
    raw_text: routerCtx.raw_text,
    normalized_text: routerCtx.normalized_text,
    command_name: qCmd,
    target_id: queryTargetId,
    query_match: true,
    council_blocked: true,
    response_type,
    source_formatter: 'tryFinalizeSlackQueryRoute',
    slack_route_label: routerCtx.slack_route_label ?? null,
  });
  return wrapQueryFinalizePlainText(plain, { effectiveQueryLine: effectiveLine });
}
