import {
  DECISIONS_FILE,
  LESSONS_FILE,
  INTERACTIONS_FILE,
  APPROVALS_FILE,
} from '../storage/paths.js';
import { getRecentRecords } from '../storage/jsonStore.js';
import { buildChannelHint } from './hints.js';
import { getCallJson } from './callJson.js';
import {
  PERSONA_REGISTRY,
  normalizePersonaList,
  selectAutoPersonas,
} from './personas.js';
import { evaluateMatrixCellTrigger } from './matrixCell.js';
import { mergeRisks } from './risk.js';
import { getExecutiveHonorificPromptBlock } from '../runtime/executiveAddressing.js';

const PERSONA_VIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    one_line_summary: { type: 'string' },
    recommendation: { type: 'string' },
    strongest_objection: { type: 'string' },
    key_risks: { type: 'array', items: { type: 'string' } },
    next_actions: { type: 'array', items: { type: 'string' } },
    unresolved_tensions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: [
    'one_line_summary',
    'recommendation',
    'strongest_objection',
    'key_risks',
    'next_actions',
    'unresolved_tensions',
    'confidence',
  ],
};

function dedupeList(items, max = 6) {
  return [...new Set((items || []).filter(Boolean))].slice(0, max);
}

function normalizeLine(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function isStrongObjection(text) {
  return /(치명|중대|법적|컴플라이언스|회복 불가|돌이킬 수|브랜드 훼손|중단)/.test(
    String(text || '')
  );
}

function parseCouncilCommand(trimmed) {
  const auto = trimmed.match(/^협의모드:\s*(.+)$/);
  if (auto) return { type: 'council_auto', question: auto[1].trim() };

  const manual = trimmed.match(/^협의모드\s+([^:]+):\s*(.+)$/);
  if (manual) {
    const personas = manual[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { type: 'council_manual', personas, question: manual[2].trim() };
  }

  const matrix = trimmed.match(/^매트릭스셀:\s*(.+)$/);
  if (matrix) return { type: 'matrix_forced', question: matrix[1].trim() };

  const addView = trimmed.match(/^관점추가\s+([^:]+):\s*(.+)$/);
  if (addView) return { type: 'add_persona', personas: [addView[1]], question: addView[2].trim() };

  return null;
}

async function runPersonaLLM(personaId, userText, channelContext) {
  const callJSON = getCallJson();
  if (!callJSON) throw new Error('agents: callJSON not injected (initAgents not called)');
  const persona = PERSONA_REGISTRY[personaId];
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);

  const instructions = `
${persona.buildInstructions(buildChannelHint(channelContext))}

${getExecutiveHonorificPromptBlock()}

응답 규칙:
- recommendation은 실행 가능한 문장으로 작성.
- strongest_objection은 핵심 반대 1개를 가장 강하게 제시.
- unresolved_tensions는 남는 충돌만 0~3개.
- next_actions는 1~4개.
`;

  return callJSON({
    instructions,
    input: userText,
    schemaName: `persona_view_${personaId}`,
    schema: PERSONA_VIEW_SCHEMA,
  });
}

function buildMemorySnippet(records, formatter, max = 2) {
  return records.slice(0, max).map(formatter);
}

function tokenize(text) {
  return dedupeList(
    String(text || '')
      .toLowerCase()
      .split(/[^가-힣a-z0-9_]+/)
      .filter((w) => w.length >= 2),
    40
  );
}

function scoreRecord(rec, tokens, fields) {
  const content = fields.map((f) => String(rec?.[f] || '').toLowerCase()).join(' ');
  let score = 0;
  for (const tok of tokens) {
    if (content.includes(tok)) score += 1;
  }
  return score;
}

function pickRelevant(records, tokens, fields, max = 3) {
  return records
    .map((r) => ({ r, score: scoreRecord(r, tokens, fields) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.r);
}

async function buildInstitutionalMemory(userText) {
  const [decisions, lessons, interactions, approvals] = await Promise.all([
    getRecentRecords(DECISIONS_FILE, 40),
    getRecentRecords(LESSONS_FILE, 40),
    getRecentRecords(INTERACTIONS_FILE, 40),
    getRecentRecords(APPROVALS_FILE, 40),
  ]);

  const tokens = tokenize(userText);
  const relDecisions = pickRelevant(decisions, tokens, ['title', 'adopted_option', 'strongest_objection']);
  const relLessons = pickRelevant(lessons, tokens, ['title', 'what_failed', 'what_to_change_next_time']);
  const relInteractions = pickRelevant(interactions, tokens, ['user_text']);
  const relApprovals = pickRelevant(approvals, tokens, ['title', 'question', 'strongest_objection']);

  const hints = [
    ...buildMemorySnippet(relDecisions, (d) => `결정: ${normalizeLine(d.title)} / 채택안: ${normalizeLine(d.adopted_option)}`),
    ...buildMemorySnippet(relLessons, (l) => `교훈: ${normalizeLine(l.title)} / 다음 개선: ${normalizeLine(l.what_to_change_next_time)}`),
    ...buildMemorySnippet(relApprovals, (a) => `승인기록: ${normalizeLine(a.title)} / 상태: ${a.status || 'unknown'}`),
    ...buildMemorySnippet(relInteractions, (i) => `과거질문: ${normalizeLine(i.user_text)}`),
  ].slice(0, 6);

  const recommendation =
    hints.length > 0
      ? `과거 유사 기록 ${hints.length}건 기준으로, 동일 실패 패턴 재발 방지를 반영해 실행안을 보정하세요.`
      : '유사 기록 신호가 약해 가설 기반으로 소규모 검증을 먼저 진행하세요.';

  return {
    one_line_summary: hints.length
      ? '최근 조직 기억에서 유사 패턴이 확인됩니다.'
      : '최근 조직 기억에서 직접 유사 패턴이 약합니다.',
    recommendation,
    strongest_objection: hints.length
      ? '기존 기록을 무시하면 같은 실패를 반복할 가능성이 큽니다.'
      : '기록 신호가 약해 과신하면 잘못된 확신이 생길 수 있습니다.',
    key_risks: hints.length ? ['과거 실패 패턴 반복', '의사결정 일관성 저하'] : ['근거 부족 상태에서의 과도한 확신'],
    next_actions: ['유사 사례 1~2건 근거를 명시해 실행안 업데이트'],
    unresolved_tensions: hints.length ? ['속도와 근거 축적의 긴장'] : ['탐색 속도와 정확도의 긴장'],
    confidence: hints.length ? 'medium' : 'low',
    institutional_memory_hints: hints,
  };
}

function mapToPrimaryLike(synthesis) {
  return {
    one_line_summary: synthesis.oneLineSummary,
    recommendation: synthesis.recommendation,
    strongest_objection: synthesis.strongestObjection,
    key_risks: synthesis.keyRisks,
    next_actions: synthesis.nextActions,
    ceo_decision_needed: synthesis.decisionNeeded,
    ceo_decision_question: synthesis.decisionQuestion,
  };
}

function mapToRiskLike(synthesis) {
  return {
    strongest_objection: synthesis.strongestObjection,
    hidden_risks: synthesis.keyRisks,
    reconsider_triggers: synthesis.unresolvedTensions,
    decision_should_pause: synthesis.decisionNeeded && isStrongObjection(synthesis.strongestObjection),
  };
}

function synthesizeCouncil({ personaOutputs, selectedPersonas, route, matrixInfo, institutionalHints }) {
  const lines = personaOutputs.map((p) => normalizeLine(p.one_line_summary)).filter(Boolean);
  const recommendations = personaOutputs.map((p) => normalizeLine(p.recommendation)).filter(Boolean);
  const objections = personaOutputs.map((p) => normalizeLine(p.strongest_objection)).filter(Boolean);
  const keyRisks = dedupeList(personaOutputs.flatMap((p) => p.key_risks || []), 8);
  const nextActions = dedupeList(personaOutputs.flatMap((p) => p.next_actions || []), 6);
  const unresolved = dedupeList(personaOutputs.flatMap((p) => p.unresolved_tensions || []), 6);

  const strongestObjection = objections[0] || '현재 가장 강한 반대 논리는 제한적입니다.';
  const oneLineSummary = lines[0] || '협의 결과, 실행 가능한 안으로 수렴이 필요합니다.';
  const recommendation = recommendations[0] || '핵심 리스크를 반영해 단계적으로 실행하세요.';
  const decisionNeeded = route?.urgency === 'high' || isStrongObjection(strongestObjection);
  const decisionQuestion = decisionNeeded
    ? '리스크를 수용하고 즉시 진행할지, 조건부 보류 후 보완할지 결정이 필요합니다.'
    : '현재는 조건부 실행 후 점검으로 진행 가능합니다.';

  let report = '';
  report += `한 줄 요약\n${oneLineSummary}\n\n`;
  report += `종합 추천안\n${recommendation}\n\n`;
  report += '페르소나별 핵심 관점\n';
  report += selectedPersonas
    .map((id) => {
      const p = personaOutputs.find((x) => x.personaId === id);
      if (!p) return `- ${id}: 관점 생성 실패`;
      return `- ${id}: ${normalizeLine(p.one_line_summary)} / 권고: ${normalizeLine(p.recommendation).slice(0, 120)}`;
    })
    .join('\n');
  report += '\n\n';
  report += `가장 강한 반대 논리\n${strongestObjection}\n\n`;
  report += `남아 있는 긴장 / 미해결 충돌\n${unresolved.length ? unresolved.map((u) => `- ${u}`).join('\n') : '- 없음'}\n\n`;
  report += `핵심 리스크\n${keyRisks.length ? keyRisks.map((r) => `- ${r}`).join('\n') : '- 없음'}\n\n`;
  report += `다음 행동\n${nextActions.length ? nextActions.map((a) => `- ${a}`).join('\n') : '- 없음'}\n\n`;
  report += `대표 결정 필요 여부\n${decisionNeeded ? '예' : '아니오'}\n${decisionQuestion}`;

  const diagnostics = {
    council_mode: matrixInfo?.used ? 'matrix_cell' : 'council',
    selected_personas: selectedPersonas,
    matrix_trigger: matrixInfo?.reasons?.length ? matrixInfo.reasons : [],
    institutional_memory_hint_count: institutionalHints.length,
  };

  return {
    report: report.trim(),
    diagnostics,
    oneLineSummary,
    recommendation,
    strongestObjection,
    unresolvedTensions: unresolved,
    keyRisks,
    nextActions,
    decisionNeeded,
    decisionQuestion,
  };
}

export async function runCouncilMode({
  userText,
  route,
  channelContext,
  command = null,
  approvalNeeded = false,
  strongestObjection = '',
  /** DM/스레드 이전 턴 (페르소나 LLM 입력에만 합성; 트리거·매트릭스는 explicitQuestion 유지) */
  conversationContext = '',
}) {
  const parsed = command ? parseCouncilCommand(command) : null;
  const explicitQuestion = parsed?.question || userText;
  const ctxTrim = String(conversationContext || '').trim();
  const llmUserText = ctxTrim
    ? `${ctxTrim}\n\n---\n\n(이번 협의 질문/본문)\n${explicitQuestion}`
    : explicitQuestion;

  let selectedPersonas = [];
  let matrixForced = false;
  let mode = 'auto';

  if (parsed?.type === 'council_manual') {
    selectedPersonas = normalizePersonaList(parsed.personas);
    mode = 'manual';
  } else if (parsed?.type === 'matrix_forced') {
    matrixForced = true;
    mode = 'matrix_forced';
  } else if (parsed?.type === 'add_persona') {
    mode = 'add_persona';
    selectedPersonas = selectAutoPersonas({ route, channelContext, userText: explicitQuestion });
    selectedPersonas = dedupeList([...selectedPersonas, ...normalizePersonaList(parsed.personas)], 5);
  }

  const preMatrix = evaluateMatrixCellTrigger({
    userText: explicitQuestion,
    route,
    channelContext,
    approvalNeeded,
    strongestObjection,
  });

  const useMatrix = matrixForced || preMatrix.shouldUseMatrixCell;
  if (!selectedPersonas.length) {
    selectedPersonas = selectAutoPersonas({
      route,
      channelContext,
      userText: explicitQuestion,
      matrixMode: useMatrix,
    });
  } else if (useMatrix && selectedPersonas.length < 3) {
    const expanded = selectAutoPersonas({
      route,
      channelContext,
      userText: explicitQuestion,
      matrixMode: true,
    });
    selectedPersonas = dedupeList([...selectedPersonas, ...expanded], 5);
  }

  if (!selectedPersonas.includes('risk_review') && mode === 'auto') {
    selectedPersonas.push('risk_review');
  }
  selectedPersonas = selectedPersonas.slice(0, useMatrix ? 5 : 5);

  const runPromises = selectedPersonas.map(async (personaId) => {
    if (personaId === 'knowledge_steward') {
      const memory = await buildInstitutionalMemory(explicitQuestion);
      return { personaId, ...memory };
    }
    const view = await runPersonaLLM(personaId, llmUserText, channelContext);
    return { personaId, ...view, institutional_memory_hints: [] };
  });
  const personaOutputs = await Promise.all(runPromises);

  const institutionalHints = dedupeList(
    personaOutputs.flatMap((p) => p.institutional_memory_hints || []),
    8
  );

  const synthesis = synthesizeCouncil({
    personaOutputs,
    selectedPersonas,
    route,
    matrixInfo: { used: useMatrix, reasons: preMatrix.reasons },
    institutionalHints,
  });

  const mergedRisks = mergeRisks(
    synthesis.keyRisks,
    personaOutputs.flatMap((p) => p.key_risks || [])
  );

  try {
    console.info(JSON.stringify({
      event: 'council_diagnostics',
      ts: new Date().toISOString(),
      ...synthesis.diagnostics,
    }));
  } catch { /* never crash on diagnostics */ }

  return {
    text: synthesis.report,
    primaryLike: mapToPrimaryLike(synthesis),
    riskLike: mapToRiskLike({ ...synthesis, keyRisks: mergedRisks }),
    diagnostics: synthesis.diagnostics,
    meta: {
      mode,
      selectedPersonas,
      matrix: { used: useMatrix, reasons: preMatrix.reasons },
      institutional_memory_hints: institutionalHints,
      question: explicitQuestion,
    },
  };
}

export { parseCouncilCommand };
