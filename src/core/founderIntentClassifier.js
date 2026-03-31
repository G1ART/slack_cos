/**
 * COS Constitutional Reset — Single intent classifier.
 * Regex/keyword matches are signals; final intent is resolved from signal combination + metadata.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_INTENT_CLASSIFIER

import { FounderIntent } from './founderContracts.js';

const VERSION_RE = /^버전$/;
const HELP_RE = /^(도움말|운영도움말)$/;

const META_DEBUG_RE =
  /responder|surface|sanitize|router|라우터|라우팅|COS\s*(내부|구조|동작|작동)|파이프라인|pipeline/i;
const META_QUESTION_HINT =
  /어떻게|뭐야|뭔가요|무엇|설명|알려|동작|작동|구조/;
const META_BRIEF_DIRECTIVE =
  /한\s*줄|줄로\s*만|짧게|말해\s*줘|만\s*말해|요약\s*만|답\s*만/u;

const KICKOFF_PHRASES = [
  /시작하자/,
  /프로젝트\s*(하나|한개|한\s*개)?\s*(시작|만들|생성|개설)/,
  /킥오프/,
  /새\s*프로젝트/,
];
const KICKOFF_PREFIX_RE = /^툴제작:/;

const QUERY_PREFIXES = [
  '계획상세:', '계획진행:', '계획발행목록:', '계획검토:',
  '업무상세:', '업무검토:', '업무목록:',
  '결정조회:', '교훈조회:', '조회:',
];

const STRUCTURED_PREFIXES = [
  '의사결정:', '교훈:', '계획:', '계획등록:',
  '업무등록:', '업무상태:', '업무배정:', '업무차단:', '업무해제:',
  '채널설정:', '프로젝트설정:', '리포설정:', 'DB설정:',
  '결과등록:', '실행:', '배포:', '롤백:',
  '위클리브리프', '경영보고서', '의사결정하이라이트', '교훈하이라이트', '리스크하이라이트',
];

const DEPLOY_RE =
  /배포\s*(확인|완료|연결|링크|url|결과)|deploy|github\s*(merge|pr|issue)/i;

const APPROVAL_RE =
  /승인|보류|반려|approve|reject|hold/i;

const EXECUTION_RE =
  /실행\s*(결과|상태|보고|완료)|커서\s*결과|cursor\s*result/i;

const STATUS_RE =
  /현황|상태\s*(보고|요약)|status/i;

/**
 * @param {string} normalized — already trimmed + normalized text
 * @param {Record<string, unknown>} metadata
 * @returns {{ intent: string, confidence: number, signals: string[] }}
 */
export function classifyFounderIntent(normalized, metadata = {}) {
  const t = String(normalized || '').trim();
  const signals = [];

  if (!t) {
    return { intent: FounderIntent.UNKNOWN, confidence: 1, signals: ['empty_input'] };
  }

  if (VERSION_RE.test(t)) {
    signals.push('version_exact');
    return { intent: FounderIntent.RUNTIME_META, confidence: 1, signals };
  }

  if (HELP_RE.test(t)) {
    signals.push('help_exact');
    return { intent: FounderIntent.HELP, confidence: 1, signals };
  }

  if (META_DEBUG_RE.test(t)) {
    if (META_QUESTION_HINT.test(t) || META_BRIEF_DIRECTIVE.test(t)) {
      signals.push('meta_debug_keyword', 'meta_question_form');
      return { intent: FounderIntent.META_DEBUG, confidence: 0.9, signals };
    }
    signals.push('meta_debug_keyword_only');
  }

  if (KICKOFF_PREFIX_RE.test(t) || KICKOFF_PHRASES.some((re) => re.test(t))) {
    signals.push('kickoff_phrase');
    return { intent: FounderIntent.PROJECT_KICKOFF, confidence: 0.9, signals };
  }

  for (const prefix of QUERY_PREFIXES) {
    if (t.startsWith(prefix)) {
      signals.push('query_prefix');
      return { intent: FounderIntent.QUERY_LOOKUP, confidence: 1, signals };
    }
  }

  for (const prefix of STRUCTURED_PREFIXES) {
    if (t.startsWith(prefix) || t === prefix) {
      signals.push('structured_prefix');
      return { intent: FounderIntent.STRUCTURED_COMMAND, confidence: 1, signals };
    }
  }

  if (DEPLOY_RE.test(t)) {
    signals.push('deploy_keyword');
    return { intent: FounderIntent.DEPLOY_LINKAGE, confidence: 0.7, signals };
  }

  if (APPROVAL_RE.test(t) && /대기|목록|상태|처리/.test(t)) {
    signals.push('approval_keyword');
    return { intent: FounderIntent.APPROVAL_ACTION, confidence: 0.7, signals };
  }

  if (EXECUTION_RE.test(t)) {
    signals.push('execution_keyword');
    return { intent: FounderIntent.EXECUTION_DECISION, confidence: 0.7, signals };
  }

  if (STATUS_RE.test(t) && !META_DEBUG_RE.test(t)) {
    signals.push('status_keyword');
    return { intent: FounderIntent.PROJECT_STATUS, confidence: 0.6, signals };
  }

  if (metadata.has_active_intake) {
    signals.push('active_intake_session');
    return { intent: FounderIntent.PROJECT_CLARIFICATION, confidence: 0.7, signals };
  }

  if (metadata.has_execution_ownership) {
    signals.push('execution_ownership');
    return { intent: FounderIntent.EXECUTION_DECISION, confidence: 0.6, signals };
  }

  signals.push('no_strong_signal');
  return { intent: FounderIntent.UNKNOWN, confidence: 0, signals };
}
