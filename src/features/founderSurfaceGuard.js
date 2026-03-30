/**
 * Founder Surface Guard — founder-facing 출력에서 internal orchestration 메타데이터를 제거.
 *
 * council/matrix/operator 내부 정보가 founder에게 노출되지 않도록
 * 최종 outbound Slack 텍스트를 sanitize.
 */

const BLOCKED_PATTERNS = [
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

const BLOCKED_SECTION_HEADERS = [
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
]);

/**
 * Sanitize outbound text — strip internal metadata blocks.
 * @param {string} text
 * @param {{ debugMode?: boolean, responder?: string }} opts
 * @returns {string}
 */
export function sanitizeFounderOutput(text, opts = {}) {
  if (opts.debugMode) return text;
  if (!text) return text;

  let out = String(text);

  for (const header of BLOCKED_SECTION_HEADERS) {
    const headerIdx = out.indexOf(header);
    if (headerIdx >= 0) {
      const sectionEnd = findSectionEnd(out, headerIdx);
      out = out.slice(0, headerIdx) + out.slice(sectionEnd);
    }
  }

  for (const pat of BLOCKED_PATTERNS) {
    pat.lastIndex = 0;
    out = out.replace(pat, '');
  }

  out = out.replace(/\n{3,}/g, '\n\n').trim();

  return out;
}

function findSectionEnd(text, headerStart) {
  const afterHeader = text.indexOf('\n', headerStart);
  if (afterHeader < 0) return text.length;

  let pos = afterHeader + 1;
  while (pos < text.length) {
    const lineEnd = text.indexOf('\n', pos);
    const line = lineEnd < 0 ? text.slice(pos) : text.slice(pos, lineEnd);

    if (line.trim() === '' || line.startsWith('- ')) {
      pos = lineEnd < 0 ? text.length : lineEnd + 1;
      continue;
    }
    break;
  }
  return pos;
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
  return { leaked: found.length > 0, patterns: found };
}
