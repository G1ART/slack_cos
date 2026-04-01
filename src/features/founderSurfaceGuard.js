/**
 * Founder Surface Guard — founder-facing 출력에서 internal orchestration 메타데이터를 제거.
 *
 * council/matrix/operator 내부 정보가 founder에게 노출되지 않도록
 * 최종 outbound Slack 텍스트를 sanitize.
 *
 * vNext.10 — old Council memo headings + persona literal bullets + 승인 대기열 raw 하드 블록.
 */

import { getPersonaRegistryKeys } from '../agents/personas.js';

const BLOCKED_PATTERNS = [
  /(?:^|\n)\s*한\s*줄\s*요약\s*(?=\n|$)/g,
  /내부\s*처리\s*정보/g,
  /협의\s*모드:\s*(?:matrix_cell|council)/g,
  /참여\s*페르소나:\s*[^\n]+/g,
  /matrix\s*trigger:\s*[^\n]+/g,
  /institutional\s*memory\s*힌트\s*수:\s*\d+/g,
  /실행\s*작업\s*후보로\s*보입니다[^\n]*/g,
  /필요하면\s*'업무등록:[^']*'\s*형태로\s*등록하세요\.?/g,
  /orchestration_mode:\s*\w+/g,
  /matrix_cell/g,
  /selected_personas/g,
  /matrix_reasons/g,
];

/** vNext.10 — legacy Council section titles (longest-first strip order) */
export const OLD_STYLE_COUNCIL_SECTION_HEADERS = [
  '페르소나별 핵심 관점',
  '대표 결정 필요 여부',
  '가장 강한 반대 논리',
  '남아 있는 긴장 / 미해결 충돌',
  '남아 있는 긴장',
  '종합 추천안',
  '핵심 리스크',
  '승인 대기열',
];

const BLOCKED_SECTION_HEADERS = [
  ...OLD_STYLE_COUNCIL_SECTION_HEADERS,
  '내부 처리 정보',
  'Internal Processing',
];

const CANONICAL_SURFACES = new Set([
  'partner_surface',
  'research_surface',
  'kickoff_surface',
  'execution_surface',
  'clarification_surface',
  'document_review_surface',
  'decision_packet_surface',
  'deliverable_bundle_surface',
  'synthesis_surface',
  'executive_surface',
  'project_bootstrap',
  'existing_project_resolved',
  'existing_project_unresolved',
  'runtime_meta_surface',
  'meta_debug_surface',
]);

/** Substrings that must not reach founders (detection / trace) */
const OLD_COUNCIL_MARKER_SUBSTRINGS = [
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  'strategy_finance:',
  'risk_review:',
  '참여 페르소나:',
];

let _personaBulletRe = null;
function getPersonaBulletLineRe() {
  if (_personaBulletRe) return _personaBulletRe;
  const keys = getPersonaRegistryKeys().sort((a, b) => b.length - a.length);
  const alt = keys.join('|');
  _personaBulletRe = new RegExp(`^\\s*-\\s*(?:${alt}):\\s*.*$`, 'gim');
  return _personaBulletRe;
}

function normalizeLineForHeaderCheck(line) {
  return String(line || '')
    .trim()
    .replace(/^\*+\s*/, '')
    .replace(/\s*\*+$/, '')
    .trim();
}

function isKnownSectionHeaderLine(trimLine) {
  const t = normalizeLineForHeaderCheck(trimLine);
  return BLOCKED_SECTION_HEADERS.some((h) => t === h || t.startsWith(`${h} `));
}

/**
 * Remove legacy Council section: header line + following body until next known header or EOF.
 * @param {string} text
 * @param {number} headerIdx index where BLOCKED_SECTION_HEADERS label starts
 * @param {string} headerLabel
 */
function stripBlockedSection(text, headerIdx, headerLabel) {
  const nl = text.indexOf('\n', headerIdx + headerLabel.length);
  if (nl < 0) {
    return text.slice(0, headerIdx) + text.slice(headerIdx + headerLabel.length);
  }
  let pos = nl + 1;
  while (pos < text.length) {
    const lineEnd = text.indexOf('\n', pos);
    const rawLine = lineEnd < 0 ? text.slice(pos) : text.slice(pos, lineEnd);
    const trim = rawLine.trim();
    if (trim === '') {
      pos = lineEnd < 0 ? text.length : lineEnd + 1;
      continue;
    }
    if (/^[-·*]\s/.test(rawLine) || /^\s{2,}\S/.test(rawLine)) {
      pos = lineEnd < 0 ? text.length : lineEnd + 1;
      continue;
    }
    if (isKnownSectionHeaderLine(trim)) break;
    pos = lineEnd < 0 ? text.length : lineEnd + 1;
  }
  return text.slice(0, headerIdx) + text.slice(pos);
}

function stripAllBlockedSections(text) {
  let out = text;
  const sorted = [...OLD_STYLE_COUNCIL_SECTION_HEADERS].sort((a, b) => b.length - a.length);
  let guard = 0;
  while (guard++ < 200) {
    let changed = false;
    for (const header of sorted) {
      const idx = out.indexOf(header);
      if (idx < 0) continue;
      if (idx > 0 && out[idx - 1] !== '\n') continue;
      out = stripBlockedSection(out, idx, header);
      changed = true;
      break;
    }
    if (!changed) break;
  }

  for (const header of ['내부 처리 정보', 'Internal Processing']) {
    let idx;
    while ((idx = out.indexOf(header)) >= 0) {
      const beforeOk = idx === 0 || out[idx - 1] === '\n';
      if (!beforeOk) break;
      const afterHeader = out.indexOf('\n', idx);
      if (afterHeader < 0) {
        out = out.slice(0, idx);
        break;
      }
      let pos = afterHeader + 1;
      while (pos < out.length) {
        const lineEnd = out.indexOf('\n', pos);
        const line = lineEnd < 0 ? out.slice(pos) : out.slice(pos, lineEnd);
        if (line.trim() === '' || line.trim().startsWith('- ')) {
          pos = lineEnd < 0 ? out.length : lineEnd + 1;
          continue;
        }
        break;
      }
      out = out.slice(0, idx) + out.slice(pos);
    }
  }

  return out;
}

/**
 * Founder-safe 승인 말미 (Council 본문에 raw '승인 대기열' 블록 대신).
 * @param {string} approvalId
 */
export function formatFounderApprovalAppendix(approvalId) {
  const id = String(approvalId || '').trim();
  if (!id) return '';
  return [
    '',
    '*현재 승인 상태:* pending',
    `*승인 ID:* \`${id}\``,
    '*대표 액션:* 승인·보류 버튼을 사용하거나 COS에 결정을 요청해 주세요.',
  ].join('\n');
}

export function containsOldCouncilMarkers(text) {
  const t = String(text || '');
  return OLD_COUNCIL_MARKER_SUBSTRINGS.some((m) => t.includes(m));
}

export function containsPersonaLiterals(text) {
  getPersonaBulletLineRe().lastIndex = 0;
  const re = new RegExp(getPersonaBulletLineRe().source, getPersonaBulletLineRe().flags);
  return re.test(String(text || ''));
}

/** Legacy Council `승인 대기열` 섹션(헤더 줄 + 후속 bullet). 킥오프 copy의 "승인 대기열(APR)을…" 는 제외. */
export function containsApprovalQueueRaw(text) {
  return /(?:^|\n)\s*승인\s*대기열\s*\n\s*-/m.test(String(text || ''));
}

/**
 * After sanitize, if forbidden fragments remain → hard strip message (council 포함).
 */
export function founderHardBlockRemaining(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (containsOldCouncilMarkers(t)) return true;
  if (containsPersonaLiterals(t)) return true;
  if (containsApprovalQueueRaw(t)) return true;
  return false;
}

export const FOUNDER_HARD_BLOCK_FALLBACK =
  '[COS] founder 출력 계약 위반이 감지되어 응답을 차단했습니다. 요청을 운영 문제 재정의 포맷으로 다시 정렬한 뒤 진행하겠습니다.';

/**
 * Sanitize outbound text — strip internal metadata blocks.
 * @param {string} text
 * @param {{ debugMode?: boolean, responder?: string, allowUnsafeDebugBypass?: boolean }} opts
 * @returns {string}
 */
export function sanitizeFounderOutput(text, opts = {}) {
  if (opts.debugMode && opts.allowUnsafeDebugBypass === true) return text;
  if (!text) return text;

  // 조회(query) 응답은 저장 필드·QC 포맷에 구형 Council 헤더가 섞여도 **원문 신뢰** (Router_Lockdown 계약).
  if (opts.responder === 'query') {
    return String(text);
  }

  let out = String(text);

  out = stripAllBlockedSections(out);

  const pRe = getPersonaBulletLineRe();
  pRe.lastIndex = 0;
  out = out.replace(pRe, '');

  for (const pat of BLOCKED_PATTERNS) {
    pat.lastIndex = 0;
    out = out.replace(pat, '');
  }

  out = out.replace(/\n{3,}/g, '\n\n').trim();

  if (founderHardBlockRemaining(out)) {
    return FOUNDER_HARD_BLOCK_FALLBACK;
  }

  return out;
}

/**
 * Validate that the responder resolves to a canonical founder surface.
 */
export function isCanonicalSurface(responder) {
  return CANONICAL_SURFACES.has(responder);
}

/**
 * Detect if text contains leaked internal metadata.
 */
export function detectInternalLeakage(text) {
  if (!text) return { leaked: false, patterns: [] };
  const found = [];
  for (const pat of BLOCKED_PATTERNS) {
    pat.lastIndex = 0;
    if (pat.test(text)) found.push(pat.source);
    pat.lastIndex = 0;
  }
  for (const header of BLOCKED_SECTION_HEADERS) {
    if (text.includes(header)) found.push(header);
  }
  if (containsPersonaLiterals(text)) found.push('persona_literal_line');
  return { leaked: found.length > 0, patterns: found };
}
