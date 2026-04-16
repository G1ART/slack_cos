/**
 * W4 — Founder surface renderer (Slack-facing 텍스트 조립).
 *
 * Slice A + B: 상태별 한국어 헤더 한 줄을 붙이고, 본문은 COS 모델 산문을 그대로 둔다. 헤더 선택은
 * `buildFounderSurfaceModel` 이 truth 에서 확정한 `surface_intent` 를 따르며, renderer 는 텍스트
 * 조립만 한다. 동일 스레드에서 직전 assistant 턴이 같은 헤더로 시작한 경우 (연속성 규칙) 헤더를 생략해
 * 반복을 피한다.
 *
 * 금지 (CONSTITUTION §2, §6, WHAT Non-negotiable):
 *  - founder 에게 run_id/packet_id/emit_patch/lease/raw JSON/callback 내부 용어 출력
 *  - 가짜 완료, 과장된 자동화 주장
 *  - workflow 엔진 주장 (이 파일은 텍스트 조립만)
 */

/**
 * @typedef {import('./founderSurfaceModel.js').FounderSurfaceIntent} FounderSurfaceIntent
 */

/** @type {Record<string, string | null>} */
const HEADER_BY_INTENT = {
  accepted: '요청을 접수했습니다.',
  running: '아직 실행이 진행 중입니다.',
  blocked: '현재 진행이 막혀 있습니다.',
  review_required: '확인이 필요한 상태입니다.',
  completed: '요청을 완료했습니다.',
  failed: '실행이 실패로 마감됐습니다.',
  informational: null,
};

/**
 * 내부 실행 토큰(run_id, packet_id 등)이 섞인 사유 문자열은 founder 표면에 바로 노출하지 않는다.
 * 스네이크_케이스 토큰이 연속으로 포함된 경우 machine 라벨로 간주해 hide.
 *
 * @param {string | null | undefined} reason
 * @returns {string}
 */
function sanitizeFounderFacingReason(reason) {
  const s = String(reason || '').trim();
  if (!s) return '';
  if (/(^|\s)[a-z][a-z0-9]*(_[a-z0-9]+){1,}(\s|$)/.test(` ${s} `)) return '';
  if (/\b(run_id|packet_id|dispatch_id|emit_patch|lease|callback|webhook|tool_result|harness_dispatch|harness_packet|invoke_external_tool)\b/.test(s)) {
    return '';
  }
  return s.length > 240 ? s.slice(0, 239) + '…' : s;
}

/**
 * @param {{ surface_intent: FounderSurfaceIntent, blocker_reason: string | null, review_reason: string | null }} sm
 * @returns {string | null}
 */
function headerForSurfaceModel(sm) {
  const base = HEADER_BY_INTENT[sm.surface_intent];
  if (!base) return null;
  if (sm.surface_intent === 'blocked') {
    const r = sanitizeFounderFacingReason(sm.blocker_reason);
    return r ? `${base} 사유: ${r}` : base;
  }
  if (sm.surface_intent === 'review_required') {
    const r = sanitizeFounderFacingReason(sm.review_reason);
    return r ? `${base} ${r}` : base;
  }
  return base;
}

/**
 * @param {unknown[] | undefined} recentTurns
 * @returns {string}
 */
function lastAssistantTurnText(recentTurns) {
  if (!Array.isArray(recentTurns) || !recentTurns.length) return '';
  for (let i = recentTurns.length - 1; i >= 0; i -= 1) {
    const t = recentTurns[i];
    if (!t || typeof t !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (t).role;
    if (String(r || '').trim() === 'assistant') {
      const txt = /** @type {Record<string, unknown>} */ (t).text;
      return String(txt || '').trim();
    }
  }
  return '';
}

/**
 * @param {string} modelText
 * @param {string} header
 */
function modelAlreadyLeadsWithHeader(modelText, header) {
  const head = header.replace(/\s+/g, ' ').trim();
  const firstLine = String(modelText || '').replace(/\s+/g, ' ').trim().slice(0, head.length);
  return firstLine === head;
}

/**
 * 모델이 이미 납품 파일명을 언급했으면 재노출하지 않는다 (C4 반복 억제).
 *
 * @param {Array<{ label: string, detail?: string }>} deliverables
 * @param {string} modelText
 * @returns {string[]}
 */
function unmentionedDeliverableLabels(deliverables, modelText) {
  if (!Array.isArray(deliverables) || !deliverables.length) return [];
  const lower = String(modelText || '').toLowerCase();
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const d of deliverables) {
    const label = String((d && d.label) || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    if (lower.includes(label.toLowerCase())) continue;
    out.push(label);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * @param {string[]} evidenceLines
 * @param {string} modelText
 */
function unmentionedEvidenceLines(evidenceLines, modelText) {
  if (!Array.isArray(evidenceLines) || !evidenceLines.length) return [];
  const lower = String(modelText || '').toLowerCase();
  const out = [];
  for (const line of evidenceLines) {
    const s = String(line || '').trim();
    if (!s) continue;
    if (lower.includes(s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * @param {{
 *   surfaceModel: ReturnType<import('./founderSurfaceModel.js').buildFounderSurfaceModel>,
 *   modelText: string,
 *   recentTurns?: unknown[],
 * }} input
 * @returns {{ text: string, rendered_by: 'model_passthrough' | 'surface_state', header: string | null, skipped_header_for_continuity?: boolean, appended_deliverables?: string[], appended_evidence?: string[] }}
 */
export function renderFounderSurfaceText(input) {
  const modelText = String((input && input.modelText) || '').trim();
  const sm = input && input.surfaceModel ? input.surfaceModel : null;
  if (!sm || !modelText) {
    return { text: modelText, rendered_by: 'model_passthrough', header: null };
  }

  const header = headerForSurfaceModel(sm);

  /** @type {string[]} */
  let appendedDeliverables = [];
  /** @type {string[]} */
  let appendedEvidence = [];
  const trailerParts = [];
  if (sm.surface_intent === 'completed') {
    appendedDeliverables = unmentionedDeliverableLabels(sm.deliverables || [], modelText);
    if (appendedDeliverables.length) {
      trailerParts.push(`산출물: ${appendedDeliverables.join(', ')}`);
    }
  }
  if (sm.surface_intent === 'review_required') {
    appendedEvidence = unmentionedEvidenceLines(sm.evidence_lines || [], modelText);
    if (appendedEvidence.length) {
      trailerParts.push(['확인 근거:', ...appendedEvidence.map((s) => `- ${s}`)].join('\n'));
    }
  }
  const trailer = trailerParts.length ? `\n\n${trailerParts.join('\n\n')}` : '';

  if (!header && !trailer) {
    return { text: modelText, rendered_by: 'model_passthrough', header: null };
  }

  let headerToPrepend = header || null;
  let skippedForContinuity = false;
  if (headerToPrepend && modelAlreadyLeadsWithHeader(modelText, headerToPrepend)) {
    headerToPrepend = null;
  }
  if (headerToPrepend) {
    const prevAssistant = lastAssistantTurnText(input && input.recentTurns);
    if (prevAssistant && prevAssistant.startsWith(headerToPrepend)) {
      headerToPrepend = null;
      skippedForContinuity = true;
    }
  }

  const body = headerToPrepend ? `${headerToPrepend}\n\n${modelText}` : modelText;
  const text = `${body}${trailer}`;
  return {
    text,
    rendered_by: headerToPrepend || trailer ? 'surface_state' : 'model_passthrough',
    header,
    ...(skippedForContinuity ? { skipped_header_for_continuity: true } : {}),
    ...(appendedDeliverables.length ? { appended_deliverables: appendedDeliverables } : {}),
    ...(appendedEvidence.length ? { appended_evidence: appendedEvidence } : {}),
  };
}
