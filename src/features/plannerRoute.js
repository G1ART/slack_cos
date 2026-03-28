import crypto from 'crypto';

const DEDUP_TTL_MS = 120_000;
/** @type {Map<string, { at: number, plan_id: string }>} */
const dedupPlanMap = new Map();

function hashKey(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
}

/** dedup 키용 — 공백 축약·trim */
export function normalizePlannerBodyForDedup(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildPlannerDedupKey({ channel, user, normalizedBody }) {
  const b = normalizePlannerBodyForDedup(normalizedBody);
  return `${channel || 'dm'}:${user || 'anon'}:${hashKey(b)}`;
}

export function peekPlannerDedupPlanId(cacheKey) {
  const hit = dedupPlanMap.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.at > DEDUP_TTL_MS) {
    dedupPlanMap.delete(cacheKey);
    return null;
  }
  return hit.plan_id;
}

export function storePlannerDedupPlanId(cacheKey, planId) {
  dedupPlanMap.set(cacheKey, { at: Date.now(), plan_id: String(planId || '') });
}

export function invalidatePlannerDedupKey(cacheKey) {
  dedupPlanMap.delete(cacheKey);
}

function stripOuterCodeFence(s) {
  const t = String(s || '').trim();
  if (!t.startsWith('```')) return String(s || '');
  const m = t.match(/^```[\w]*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (m) return m[1].trim();
  const m2 = t.match(/^```([\s\S]*?)```\s*$/);
  if (m2) return m2[1].replace(/^[\w]*\r?\n/, '').trim();
  return String(s || '');
}

function stripEdgeVs(s) {
  return String(s || '')
    .replace(/^[\uFE0F\uFE0E]+/u, '')
    .replace(/[\uFE0F\uFE0E]+$/u, '')
    .trim();
}

function stripOuterSlackWrap(s) {
  let t = String(s || '').trim();
  for (let i = 0; i < 8; i += 1) {
    t = stripEdgeVs(t);
    const prev = t;
    if (t.startsWith('*') && t.endsWith('*') && t.length > 2) t = t.slice(1, -1).trim();
    else if (t.startsWith('_') && t.endsWith('_') && t.length > 2) t = t.slice(1, -1).trim();
    if (t === prev) break;
  }
  return stripEdgeVs(t);
}

/**
 * 줄 앞의 Slack/mrkdwn 잡음 제거.
 * - `*계획등록:` 처럼 닫는 `*` 없이 시작만 굵게 온 경우
 * - `> ` 인용, `- `·`•` 리스트, `1. ` 번호
 * - 줄 전체가 `*`·`_`·공백뿐이면 빈 줄로 간주
 */
function stripLeadingLineDecorations(s) {
  let line = String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  for (let g = 0; g < 24; g += 1) {
    const prev = line;
    line = line.replace(/^>\s*/, '');
    line = line.replace(/^[-–—•∙·]\s*/, '');
    line = line.replace(/^\d{1,3}\.\s+/, '');
    // 굵게/기울임 시작 마커 (같은 줄에 닫는 * 가 없을 때 대비)
    line = line.replace(/^[*＊_＿]{1,4}(?=\S)/u, '');
    line = line.replace(/^[*＊_＿]+\s+/u, '');
    line = line.trim();
    if (line === prev) break;
  }
  if (/^[*＊_＿\s]+$/u.test(line)) return '';
  return line;
}

function dropLeadingBlankLines(s) {
  const lines = String(s || '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const piece = lines[i].replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!piece) {
      i += 1;
      continue;
    }
    const afterDeco = stripLeadingLineDecorations(lines[i]);
    if (!afterDeco) {
      i += 1;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').trim();
}

/** 콜론 역할 문자 (Slack/IME·전각·비율 콜론 등). `.` 은 U+2028/U+2029 에서 끊기므로 본문은 [\s\S] 사용 */
const PLANNER_COLON = '[:：﹕∶\uFF1A\u2236\uFE55\uFE13\u02D0]';

const SPACE_CLASS = '[\\s\\u00A0\\u3000]+';

/**
 * rich_text 가 `계획` / `등록` / `:` 를 노드로 쪼개면 flatten 시 "계획 등록 :" 가 되어 ^계획등록 매칭이 깨지고 Council 로 새는 문제.
 * 줄 시작(또는 문자열 시작)에서만 보수적으로 붙인다. (문장 중 "계획 등록" 자연어는 줄 시작 패턴이 아니면 건드리지 않음)
 */
export function collapsePlannerRegisterSpacing(text) {
  let t = String(text || '');
  t = t.normalize('NFKC');
  // 계획 + 공백 + 등록 + 공백* + 콜론
  const colonRe = new RegExp(
    `(^|[\\r\\n])([\\t \\u00A0\\u3000]*)(계획)${SPACE_CLASS}(등록)([\\s\\u00A0\\u3000]*)(${PLANNER_COLON})`,
    'gu'
  );
  t = t.replace(colonRe, (_, bol, ind, _a, _b, sp2, col) => `${bol}${ind}계획등록${sp2}${col}`);
  // 줄 끝: 계획 등록 (빈 본문 키워드만)
  const eolRe = new RegExp(
    `(^|[\\r\\n])([\\t \\u00A0\\u3000]*)(계획)${SPACE_CLASS}(등록)[\\s\\u00A0\\u3000]*(?=[\\r\\n]|$)`,
    'gu'
  );
  t = t.replace(eolRe, (_, bol, ind) => `${bol}${ind}계획등록`);
  return t;
}

/**
 * 첫 줄만 `계획등록:`(또는 키워드만) 이고 본문이 다음 줄에 있는 Slack 멀티라인 입력.
 * tryExtractPlannerOnString 이 첫 줄만 보면 empty_body → per-line 루프는 두 번째 줄이
 * `계획등록` 으로 시작하지 않아 null → Council 로 새는 버그를 막는다.
 */
function collapsePlannerIntakeMultiline(text) {
  const rawLines = String(text || '').split(/\r?\n/);
  if (rawLines.length < 2) return text;

  for (let i = 0; i < rawLines.length; i++) {
    let l = rawLines[i].replace(/[\u200B-\u200D\uFEFF]/g, '');
    l = unwrapLineSlack(l.trim());
    l = stripLeadingLineDecorations(l);
    if (!l) continue;

    const colonOnly = new RegExp(`^계획등록\\s*${PLANNER_COLON}\\s*$`).test(l);
    const keywordOnly = /^계획등록\s*$/.test(l);
    if (!colonOnly && !keywordOnly) continue;

    const tail = rawLines.slice(i + 1).join('\n').trim();
    if (!tail) continue;

    const head = rawLines.slice(0, i).join('\n').trim();
    const mergedFirst = `계획등록: ${tail}`;
    return head ? `${head}\n${mergedFirst}` : mergedFirst;
  }
  return text;
}

/**
 * route 판정 전 파이프라인 (Council 이전에 동일 적용 권장)
 */
export function normalizePlannerInputForRoute(s) {
  let t = String(s || '').normalize('NFKC');
  t = collapsePlannerRegisterSpacing(t);
  t = t.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  t = stripEdgeVs(t);
  t = stripOuterCodeFence(t);
  t = stripOuterSlackWrap(t);
  t = stripOuterCodeFence(t);
  t = stripOuterSlackWrap(t);
  t = dropLeadingBlankLines(t);
  t = stripEdgeVs(t.trim());
  // Slack rich text 등에서 U+2028/U+2029 만 삽입되면 시각적 한 줄인데 (.*) 매칭이 깨짐 → \n 으로 정규화
  t = t.replace(/\u2028/g, '\n').replace(/\u2029/g, '\n');
  t = collapsePlannerIntakeMultiline(t);
  return t;
}

function unwrapLineSlack(s) {
  return stripOuterSlackWrap(s);
}

/**
 * Hotfix v2 로그 (grep: planner_normalized_input 등)
 */
export function logPlannerFc(event, fields = {}) {
  const payload = {
    planner_event: event,
    ts: new Date().toISOString(),
    ...fields,
  };
  try {
    console.info(JSON.stringify(payload));
  } catch {
    console.info('[planner_fc]', event, fields);
  }
}

/**
 * Structured planner pipeline logs (grep-friendly).
 */
export function logPlannerStage(stage, fields = {}) {
  const payload = {
    stage: `planner_${stage}`,
    ts: new Date().toISOString(),
    ...fields,
  };
  try {
    console.info(JSON.stringify(payload));
  } catch {
    console.info('[planner]', stage, fields);
  }
}

/**
 * `단계별계획등록` 오탐 방지: `계획등록` 앞 글자가 한·영 단어 내부처럼 붙어 있으면 false.
 * `G1_COS 계획등록:` 은 앞이 공백/`_`/문장부호이면 허용.
 * @param {string} l full line
 * @param {number} idx indexOf('계획등록')
 */
function isPlannerRegisterAnchorOk(l, idx) {
  if (idx <= 0) return true;
  const prev = l[idx - 1];
  if (!prev) return true;
  if (/\s/.test(prev)) return true;
  if (/[>:)\]"'\],，.。!！?？]/.test(prev)) return true;
  if (prev === '_') return true;
  if (/[가-힣a-zA-Z0-9]/.test(prev)) return false;
  return true;
}

function tryExtractPlannerOnString(t, fullOriginal) {
  const normInput = (fullOriginal || t).slice(0, 500);

  if (new RegExp(`^계획등록\\s*${PLANNER_COLON}\\s*$`).test(t)) {
    return {
      raw: '',
      route_reason: 'explicit_colon_empty',
      normalized_input: normInput,
      empty_body: true,
    };
  }
  if (/^계획등록\s*$/.test(t) || /^계획등록\s+$/.test(t)) {
    return {
      raw: '',
      route_reason: 'explicit_keyword_empty',
      normalized_input: normInput,
      empty_body: true,
    };
  }

  let m = t.match(new RegExp(`^계획등록\\s*${PLANNER_COLON}\\s*([\\s\\S]*)$`));
  if (m) {
    return {
      raw: (m[1] || '').trim(),
      route_reason: 'explicit_colon',
      normalized_input: normInput,
      empty_body: !(m[1] || '').trim(),
    };
  }

  m = t.match(/^계획등록\s+(\S[\s\S]*)$/);
  if (m) {
    const body = m[1].trim();
    return {
      raw: body,
      route_reason: 'explicit_keyword_space',
      normalized_input: normInput,
      empty_body: !body,
    };
  }

  const nlPatterns = [
    {
      re: /(?:^|[\n。！？!?])(?:계획|진행\s*계획|작업\s*계획|운영\s*루프[^。\n]{0,120}계획)(?:을|를)?\s*(?:세워\s*줘|세워주세요|만들어\s*줘|만들어주세요|수립해\s*줘|수립해주세요|짜\s*줘|짜주세요)/,
      reason: 'nl_plan_verb',
    },
    {
      re: /(?:단계별\s*계획|작업\s*단계)(?:으로\s*)?(?:나눠\s*줘|나눠주세요|나눠\s*주세요|쪼개\s*줘|쪼개주세요)/,
      reason: 'nl_split_steps',
    },
  ];

  for (const { re, reason } of nlPatterns) {
    if (re.test(t)) {
      return { raw: t, route_reason: reason, normalized_input: normInput, empty_body: false };
    }
  }

  return null;
}

/**
 * @returns {{ raw: string, route_reason: string, normalized_input: string, empty_body?: boolean } | null}
 */
export function extractPlannerRequest(normalizedForRoute) {
  const original = String(normalizedForRoute || '').trim();
  if (!original) return null;

  // 명시적 plan 관리 명령은 intake 대상 아님 (오매칭·중복 계획 생성 방지)
  if (/^계획(상세|작업목록|승인|기각|발행목록|발행|진행|시작|완료|차단|변경|요약)(?:\s|$|[：:])/u.test(original)) {
    return null;
  }

  // 전체 문자열이 곧 한 덩어리일 때 (NL 등)
  let hit = tryExtractPlannerOnString(original, original);
  if (hit) return hit;

  const lines = original.split(/\r?\n/);
  for (const line of lines) {
    let l = line.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!l) continue;
    l = unwrapLineSlack(l);
    l = stripLeadingLineDecorations(l);
    if (!l) continue;
    if (!l.startsWith('계획등록')) continue;
    hit = tryExtractPlannerOnString(l, original);
    if (hit) return hit;
  }

  // `@G1_COS 계획등록:` 등 멘션·앱 표시명이 앞에 붙어 줄이 `계획등록`으로 시작하지 않는 경우
  for (const line of lines) {
    let l = line.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!l) continue;
    l = unwrapLineSlack(l);
    l = stripLeadingLineDecorations(l);
    if (!l) continue;
    let searchFrom = 0;
    while (searchFrom < l.length) {
      const idx = l.indexOf('계획등록', searchFrom);
      if (idx < 0) break;
      if (isPlannerRegisterAnchorOk(l, idx)) {
        const tail = l.slice(idx);
        hit = tryExtractPlannerOnString(tail, original);
        if (hit) return hit;
      }
      searchFrom = idx + 1;
    }
  }

  return null;
}

/** Slack planner 고정 응답 — app.js·회귀 fixture 와 동기화 */
export const PLANNER_SLACK_EMPTY_BODY_MESSAGE =
  '계획등록 본문이 비어 있습니다. 예: 계획등록: slack_cos에서 ...';

export const PLANNER_SLACK_ROUTING_MISS_MESSAGE = [
  '[계획등록] 입력 형식을 인식하지 못했습니다 (Council로 넘기지 않음).',
  '- 예: 계획등록: <본문> 또는 계획등록 <본문>',
  '- IME·전각 콜론·숨은 줄바꿈 문자가 끼면 인식이 실패할 수 있습니다. 한 줄로 다시 시도해 주세요.',
].join('\n');

/**
 * Top-level router hard lock: `계획등록` 계열은 Council 금지.
 * - hit: extractPlannerRequest 성공 → planner responder 고정
 * - miss: 줄 단위로 `계획등록` 으로 시작하지만 extract 실패 → planner error 만 허용
 * - none: planner 고정 아님
 * @returns {{ type: 'hit', req: object } | { type: 'miss' } | { type: 'none' }}
 */
export function analyzePlannerResponderLock(normalizedForRoute) {
  const original = String(normalizedForRoute || '').trim();
  if (!original) return { type: 'none' };

  if (/^계획(상세|작업목록|승인|기각|발행목록|발행|진행|시작|완료|차단|변경|요약)(?:\s|$|[：:])/u.test(original)) {
    return { type: 'none' };
  }

  const req = extractPlannerRequest(original);
  if (req) return { type: 'hit', req };

  const lines = original.split(/\r?\n/);
  for (const line of lines) {
    let l = line.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (!l) continue;
    l = unwrapLineSlack(l);
    l = stripLeadingLineDecorations(l);
    if (!l) continue;
    if (!l.includes('계획등록')) continue;
    let missCandidate = false;
    let searchFrom = 0;
    while (searchFrom < l.length) {
      const idx = l.indexOf('계획등록', searchFrom);
      if (idx < 0) break;
      if (isPlannerRegisterAnchorOk(l, idx)) {
        const tail = l.slice(idx);
        if (!tryExtractPlannerOnString(tail, original)) missCandidate = true;
        break;
      }
      searchFrom = idx + 1;
    }
    if (missCandidate) return { type: 'miss' };
  }

  return { type: 'none' };
}

/** Council 푸터 억제 */
export function textLooksPlannerRelated(s) {
  return /계획등록|진행\s*계획|작업\s*계획|단계별\s*계획/.test(String(s || ''));
}

export function shouldSuppressWorkCandidateFooter(s) {
  if (textLooksPlannerRelated(s)) return true;
  try {
    const n = normalizePlannerInputForRoute(s);
    for (const line of n.split(/\r?\n/)) {
      let l = unwrapLineSlack(line).trim();
      l = stripLeadingLineDecorations(l);
      if (l.startsWith('계획등록')) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
