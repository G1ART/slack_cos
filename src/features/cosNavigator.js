/**
 * COS 내비게이터 — 명령어 암기 없이 자연어로 방향·질문·다음 단계를 정리.
 * Council(다중 페르소나 합성)보다 가볍고, 사용자가 기대한 "설계도" 역할에 가깝다.
 */

import { buildChannelHint } from '../agents/hints.js';
import { COS_CAPABILITY_CATALOG_COMPACT } from './cosCapabilityCatalog.js';
import { getExecutiveHonorificPromptBlock } from '../runtime/executiveAddressing.js';

const NAVIGATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    chief_stance_line: {
      type: 'string',
      description:
        '고지능·고감성·균형: 이용자 스펙트럼·현실 체크를 담은 직설적 한 문장 (무조건 동조·돌려말하기 금지, 한국어)',
    },
    understood: {
      type: 'string',
      description: '사용자가 원하는 것을 한국어로 2~4문장',
    },
    agreement_readiness: {
      type: 'string',
      description:
        '과제/툴 정의 합의 수준을 한 단어 또는 짧은 구: forming | nearly_ready | ready 중 하나',
    },
    after_agreement_autopilot: {
      type: 'string',
      description:
        '합의가 끝난 뒤 COS·에이전트가 대표 개입 최소로 이어갈 수 있는 구체적 일 (2~5문장, 한국어)',
    },
    blocking_decisions: {
      type: 'array',
      items: { type: 'string' },
      description: '반드시 대표가 말로/승인으로 정해야 하는 것 0~3개. 없으면 빈 배열.',
    },
    ambiguities: {
      type: 'array',
      items: { type: 'string' },
      description: '아직 불명확한 점 0~4개',
    },
    questions_for_you: {
      type: 'array',
      items: { type: 'string' },
      description: '대표에게 되묻는 질문 2~4개',
    },
    suggested_paths: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          what_you_get: { type: 'string' },
          say_this_example: { type: 'string' },
        },
        required: ['title', 'what_you_get', 'say_this_example'],
      },
    },
    next_step_hint: { type: 'string' },
  },
  required: [
    'chief_stance_line',
    'understood',
    'agreement_readiness',
    'after_agreement_autopilot',
    'blocking_decisions',
    'ambiguities',
    'questions_for_you',
    'suggested_paths',
    'next_step_hint',
  ],
};

/**
 * 첫 줄 기준 `COS` / `비서` 트리거 파싱 (멀티라인 본문 지원).
 * @param {string} trimmed normalizeSlackUserPayload 결과
 * @returns {{ trigger: 'cos' | 'secretary', body: string } | null}
 */
export function tryParseCosNavigatorTrigger(trimmed) {
  const raw = String(trimmed || '').trim();
  if (!raw) return null;

  const lines = raw.split(/\r?\n/);
  const first = lines[0].trim();

  if (/^COS$/i.test(first)) {
    return { trigger: 'cos', body: lines.slice(1).join('\n').trim() };
  }

  const cosLine = first.match(/^COS(?:\s*[,:]\s*|\s+)([\s\S]*)$/i);
  if (cosLine) {
    const restFirst = cosLine[1] ?? '';
    const body = [restFirst, ...lines.slice(1)].join('\n').trim();
    return { trigger: 'cos', body };
  }

  if (/^비서$/i.test(first)) {
    return { trigger: 'secretary', body: lines.slice(1).join('\n').trim() };
  }

  const secLine = first.match(/^비서(?:\s*[,:]\s*|\s+)([\s\S]*)$/i);
  if (secLine) {
    const restFirst = secLine[1] ?? '';
    const body = [restFirst, ...lines.slice(1)].join('\n').trim();
    return { trigger: 'secretary', body };
  }

  return null;
}

/**
 * `이해한 내용` 등에서 한 줄로 접어 플래너 본문 초안을 만든다 (복붙용).
 * @param {string | null | undefined} understoodOrSnippet
 */
export function buildPlanRegisterDraftLine(understoodOrSnippet) {
  const raw = String(understoodOrSnippet ?? '').trim();
  if (!raw) {
    return '계획등록: (목표를 한 문장으로 적어 주세요. 범위·리스크·다음 액션은 bullet로 이어가도 됩니다.)';
  }
  const oneLine = raw.replace(/\s+/g, ' ').slice(0, 280);
  return `계획등록: ${oneLine}`;
}

/** 내비 응답 하단에 붙는 복붙용 계획등록 블록 (North Star 권장 패치) */
function formatPlanRegisterDraftSection(understoodSnippet) {
  const line = buildPlanRegisterDraftLine(understoodSnippet);
  return [
    '**계획등록 초안 (복붙 후 수정해서내면 플래너로 진입)**',
    '```',
    line,
    '```',
  ].join('\n');
}

/** COS / 비서 트리거만 있고 본문이 비었을 때 안내 */
export function getCosNavigatorEmptyIntro() {
  return [
    '[COS 내비게이터 · 비서실장]',
    '명령어를 외울 필요 없이, **하고 싶은 것**만 말씀해 주시면 방향을 같이 잡아 드립니다.',
    '',
    '**North Star** 과제 정의가 **서로 합의**되면, 그 다음 실행·에이전트 작업은 COS가 이어 갑니다. 당신은 게이트에서만 개입하면 됩니다.',
    '',
    '**4단계** 정렬 → 합의 → 계획 박기 → 이행 (대표 표면은 `도움말`, 전체 어휘는 `운영도움말`)',
    '',
    '**이렇게 시작하세요**',
    '- `COS Abstract랑 외부 고객 일정을 잇는 캘린더를 만들고 싶어`',
    '- `비서 지금 레포에서 뭐부터 손대야 할지 모르겠어`',
    '',
    '**흐름**',
    '1) `COS` 또는 `비서` 뒤에 상황·목표를 자유롭게 적기',
    '2) 이해·합의 수준·막힌 결정·질문·다음 단계를 정리',
    '3) 깊은 토론은 `협의모드: …`, 실행 구조는 `계획등록: …`',
    '',
    formatPlanRegisterDraftSection(null),
    '',
    '_내부 실행 어휘 전체는 `운영도움말` — 일상은 여기서 시작해도 됩니다._',
  ].join('\n');
}

function formatNavigatorPayload(p) {
  const paths = (p.suggested_paths || [])
    .map(
      (x, i) =>
        `${i + 1}. **${x.title}**\n   - 얻는 것: ${x.what_you_get}\n   - 예시로 말하기: \`${x.say_this_example}\``
    )
    .join('\n\n');

  const qs = (p.questions_for_you || []).map((q, i) => `${i + 1}. ${q}`).join('\n');
  const amb = (p.ambiguities || []).filter(Boolean);
  const ambBlock =
    amb.length > 0
      ? ['**아직 불명확한 점**', ...amb.map((a, i) => `${i + 1}. ${a}`), ''].join('\n')
      : '';

  const blockers = (p.blocking_decisions || []).filter(Boolean);
  const blockBlock =
    blockers.length > 0
      ? [
          '**대표 결정이 필요한 것 (합의 전)**',
          ...blockers.map((b, i) => `${i + 1}. ${b}`),
          '',
        ].join('\n')
      : '';

  return [
    '[COS 내비게이터 · 비서실장]',
    '',
    p.chief_stance_line || '',
    '',
    '**이해한 내용**',
    p.understood || '(없음)',
    '',
    '**합의 수준(추정)**',
    p.agreement_readiness || 'forming',
    '',
    '**합의 후 COS·에이전트가 이어갈 수 있는 일**',
    p.after_agreement_autopilot || '(아직 정의 중)',
    '',
    blockBlock,
    ambBlock,
    '**되묻고 싶은 것**',
    qs || '(없음)',
    '',
    '**추천 다음 단계 (택1 또는 자유 응답)**',
    paths,
    '',
    '**한 줄 힌트**',
    p.next_step_hint || '',
    '',
    formatPlanRegisterDraftSection(p.understood),
    '',
    '—',
    '답을 이어 붙이거나, `협의모드: …` / 위 초안을 고쳐 `계획등록: …` 로 넘어가도 됩니다.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {{ callJSON: Function, userText: string, channelContext: string | null }} args
 */
export async function runCosNavigator({ callJSON, userText, channelContext }) {
  const hint = buildChannelHint(channelContext);
  const instructions = `
당신은 G1.ART Slack COS의 "내비게이터"이자 **고지능·고감성·균형 잡힌 AI 비서실장**이다.
사용자는 수십 개의 명령어를 외우고 싶지 않다. 너의 역할은 **과제/툴 정의를 함께 다듬고**, **합의가 되면** COS·에이전트가 실행을 이어갈 수 있게 **길을 닦는 것**이다.

**고감성**: 감정 맞추기·무조건 동조가 아니라, **고객층 스펙트럼**을 상상하고 **성공에 필요한 불편한 진실**을 두려움 없이 말하며 방향을 다듬는 태도다.

${getExecutiveHonorificPromptBlock()}

${COS_CAPABILITY_CATALOG_COMPACT}

규칙:
- 한국어로만 응답 필드 작성.
- chief_stance_line: 짧고 진정성 있게 (과장 금지). 공감 연기보다 **현실·리스크**를 우선.
- agreement_readiness는 반드시 forming | nearly_ready | ready 중 하나로 써라.
- after_agreement_autopilot: 합의가 된 뒤 **대표 개입 없이** 이어갈 수 있는 구체적 작업(계획 등록, 업무/run, Cursor·GitHub 등)을 문장으로. 아직이면 "합의 후 가능한 일"을 전제로 적되 솔직히 forming이면 짧게.
- blocking_decisions: 예산·보안·대외 정책·일정 확정 등 **대표만** 결정할 수 있는 것만. 없으면 [].
- **명령어 전체 목록을 나열하지 마라.** suggested_paths 2~5개, 각 say_this_example은 자연어 한 줄.
- questions_for_you 2~4개, 구체적으로.
- ambiguities는 정말 불명확할 때만; 없으면 [].
- 본문에 다음 문구 금지 (오탐): "한 줄 요약", "종합 추천안", "페르소나별 핵심 관점", "실행 작업 후보로 보입니다".

채널 맥락:
${hint}
`.trim();

  const data = await callJSON({
    instructions,
    input: String(userText || '').slice(0, 8000),
    schemaName: 'cos_navigator',
    schema: NAVIGATOR_SCHEMA,
  });

  return formatNavigatorPayload(data);
}
