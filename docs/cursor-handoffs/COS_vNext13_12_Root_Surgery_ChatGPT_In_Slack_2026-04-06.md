# COS vNext.13.12 — Root Surgery for “ChatGPT in Slack”
# Base: main @ fcc2ed1
# Intent: founder Slack path를 "planner 위 자연어 래퍼"가 아니라 "슬랙 안의 ChatGPT형 COS"로 재수술

## 왜 아직도 봇처럼 느껴지는가 — 코드 기준 핵심 병변 4개

### 1) transcript poisoning
현재 founder 기본 경로는 `runCosNaturalPartner`를 1회만 호출하도록 바뀌었지만, 그 입력에 여전히 `priorTranscript: getConversationTranscript(threadKey)`를 넣고 있습니다.
그리고 Slack 핸들러는 user/assistant 양쪽 턴을 대화 버퍼에 계속 기록합니다.

이 조합이면:
- 예전 Council형 출력
- generic safe fallback
- 첨부 실패 안내문
이 다음 턴의 prompt context로 다시 들어갑니다.

즉, 코드가 "옛날 나쁜 답변 스타일"을 스스로 재학습시키는 구조입니다.

### 2) durable state poisoning
`founderConversationState.js` 기본 저장 위치가 아직 repo 내부 `data/founder-conversation-state.json` 입니다.
Git 추적은 끊겼지만, 런타임 기본값이 repo 안이면:
- 로컬 테스트 흔적
- 재시작 전후 state 잔존
- 오래된 file context / summary
가 founder 기본 대화 경로에 계속 스며듭니다.

### 3) attachment failure invisibility
현재 founder 기본 경로는 "성공한 첨부 요약"만 user payload에 붙이고,
실패한 첨부는 본문에 반영하지 않습니다.

그래서 모델 입장에서는
- 사용자는 "이 이미지 보고 설명해줘"라고 말했는데
- 실제 prompt 안에는 이미지 요약이 없고
- 실패 사실도 자연어 context로 안 들어와서
결국 "이미지가 제공되지 않았다" 류 generic 답이 나옵니다.

즉, 첨부 실패를 "같은 대화 표면에서 자연스럽게 설명"하지 못하는 것이 아니라,
애초에 기본 경로 prompt에 실패 정보가 거의 안 들어갑니다.

### 4) fail-closed thin surface
`thinFounderSlackSurface`는 legacy council marker가 조금만 감지돼도
본문을 최대한 살리는 대신 통째로 `SAFE_FALLBACK_TEXT`로 떨어뜨립니다.

이건 leak 방지에는 도움이 되지만,
대표 체감상 "또 봇답변"이 됩니다.

---

## 결론
지금 필요한 것은 새 규칙 추가가 아니라 아래 4개를 잘라내는 수술입니다.

1. founder 기본 경로에서 **assistant transcript 재주입 제거**
2. founder 기본 경로에서 **durable conversation state 읽기/쓰기 제거**
3. founder 기본 경로에서 **현재 턴 attachment 결과만 사용**
4. thin guard를 **salvage-first** 로 변경

---

# 실제 수정안

## A. `src/founder/founderDirectKernel.js`
### 목표
- founder 기본 경로에서 `synthesizeFounderContext` / `getFounderConversationState` / `mergeFounderConversationState` 제거
- `priorTranscript` 제거
- 현재 턴 첨부 성공/실패만 prompt에 실어 보냄

### 교체 지침
기존 `runFounderNaturalChatOnly(...)`를 아래 버전으로 교체하고,
이 함수에서 더 이상 durable state를 읽거나 쓰지 않게 합니다.

```js
import { FounderSurfaceType, SAFE_FALLBACK_TEXT } from '../core/founderContracts.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { thinFounderSlackSurface } from '../features/founderSurfaceGuard.js';
import {
  normalizeFounderMetaCommandLine,
  classifyFounderRoutingLock,
  classifyFounderOperationalProbe,
} from '../features/inboundFounderRoutingLock.js';
import { tryResolveFounderDeterministicUtility } from './founderDeterministicUtilityResolver.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';
import { isFounderStagingModeEnabled } from './founderArtifactGate.js';

export { runFounderArtifactConversationPipeline } from './founderArtifactConversationPipeline.js';

function founderPreflightTrace() {
  return {
    founder_staging_mode: isFounderStagingModeEnabled(),
    founder_preflight_boundary: true,
  };
}

function founderMinimalWorkContext(metadata, threadKey) {
  const run = getExecutionRunByThread(threadKey);
  const space = getProjectSpaceByThread(threadKey);
  const intake = getProjectIntakeSession(metadata);
  return {
    resolved: Boolean(run || space || intake),
    primary_type: run ? 'execution_run' : intake ? 'intake_session' : space ? 'project_space' : 'none',
    intake_session_id: intake?.session_id ?? intake?.id ?? null,
    project_id: run?.project_id ?? space?.project_id ?? null,
    run_id: run?.run_id ?? null,
  };
}

function buildCurrentAttachmentContext(metadata = {}) {
  const ok = Array.isArray(metadata.current_attachment_contexts) ? metadata.current_attachment_contexts : [];
  const failed = Array.isArray(metadata.current_attachment_failures) ? metadata.current_attachment_failures : [];
  const lines = [];

  for (const x of ok) {
    const name = String(x?.filename || '첨부').trim();
    const summary = String(x?.summary || '').trim();
    if (summary) lines.push(`- ${name}: ${summary.slice(0, 1600)}`);
  }

  for (const x of failed) {
    const name = String(x?.filename || '첨부').trim();
    const reason = String(x?.reason || '열지 못함').trim();
    lines.push(`- ${name}: 읽지 못함 (${reason})`);
  }

  return lines;
}

async function runFounderNaturalChatOnly(brainText, metadata, route_label, threadKey, callText) {
  if (typeof callText !== 'function') {
    return {
      text: SAFE_FALLBACK_TEXT,
      blocks: undefined,
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      trace: {
        surface_type: FounderSurfaceType.PARTNER_NATURAL,
        route_label: route_label || null,
        responder_kind: 'founder_kernel',
        founder_direct_kernel: true,
        founder_conversation_path: true,
        founder_path: 'natural_chat_only',
        founder_step: 'no_callText',
        ...founderPreflightTrace(),
      },
    };
  }

  const attachmentLines = buildCurrentAttachmentContext(metadata);

  let userPayload = String(brainText || '').trim();
  if (attachmentLines.length) {
    userPayload += `\n\n[현재 턴 첨부 참고]\n${attachmentLines.join('\n')}`;
  }

  let raw = '';
  try {
    raw = await runCosNaturalPartner({
      callText,
      userText: userPayload,
      channelContext: null,
      route: null,
      priorTranscript: '', // 핵심: 과거 assistant transcript 재주입 금지
    });
  } catch {
    raw = '';
  }

  const body = thinFounderSlackSurface(String(raw || ''));
  const workContext = founderMinimalWorkContext(metadata, threadKey);

  return {
    text: body,
    blocks: undefined,
    surface_type: FounderSurfaceType.PARTNER_NATURAL,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: 'founder_conversation',
      phase_source: 'founder_natural_chat_only',
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      responder: 'founder_kernel',
      founder_direct_kernel: true,
      founder_conversation_path: true,
      founder_path: 'natural_chat_only',
      founder_step: 'cos_single_turn',
      partner_natural: true,
      founder_surface_source: 'direct_cos_chat',
      attachment_context_count: attachmentLines.length,
      approval_required: false,
      approval_packet_attached: false,
      external_dispatch_candidate: false,
      ...founderPreflightTrace(),
    },
  };
}

export async function runFounderDirectKernel({ text, metadata = {}, route_label } = {}) {
  const normalized = normalizeFounderMetaCommandLine(String(text || '').trim());
  const threadKey = buildSlackThreadKey(metadata);
  const callText = typeof metadata.callText === 'function' ? metadata.callText : null;

  if (metadata.founder_explicit_meta_utility_path === true) {
    const routeLockEarly = classifyFounderRoutingLock(normalized);
    const opProbeEarly = classifyFounderOperationalProbe(normalized);
    const utilEligible =
      routeLockEarly?.kind === 'version' ||
      opProbeEarly?.kind === 'runtime_sha' ||
      opProbeEarly?.kind === 'provider_cursor' ||
      opProbeEarly?.kind === 'provider_supabase';

    if (utilEligible) {
      const util = tryResolveFounderDeterministicUtility({
        normalized,
        threadKey,
        metadata: { ...metadata, founder_explicit_meta_utility_path: true },
      });
      if (util.handled) {
        return {
          text: util.text,
          blocks: undefined,
          surface_type: FounderSurfaceType.RUNTIME_META,
          trace: {
            surface_type: FounderSurfaceType.RUNTIME_META,
            route_label: route_label || null,
            responder_kind: 'founder_kernel',
            founder_direct_kernel: true,
            founder_operational_meta_short_circuit: true,
            ...founderPreflightTrace(),
          },
        };
      }
    }
  }

  return runFounderNaturalChatOnly(normalized, metadata, route_label, threadKey, callText);
}
```

### 이 수정의 의미
- founder 기본 경로는 더 이상 오래된 assistant 출력/상태에 오염되지 않음
- 첨부 성공/실패가 현재 턴 안에서만 반영됨
- structured planner 회귀 파이프는 그대로 유지 가능

---

## B. `src/slack/registerHandlers.js`
### 목표
- founder 기본 경로에서는 **assistant output을 transcript buffer에 다시 저장하지 않음**
- 현재 턴 attachment 결과를 그대로 metadata로 넘김
- 예전 polluted transcript를 prompt에 재주입하지 않게 함

### 1) `recordInboundSlackExchange(...)` 수정
기존 함수에서 assistant 기록을 founder 경로에서는 생략합니다.

```js
function recordInboundSlackExchange(metadata, userInboundText, answer) {
  const key = buildSlackThreadKey(metadata);
  const u = String(userInboundText || '').trim();
  const plain = resolvePostPayload(answer).text?.trim() || '';

  if (u) recordConversationTurn(key, 'user', u);

  // founder 기본 경로는 assistant transcript를 다시 버퍼에 넣지 않는다.
  // 과거 bad style / council / safe fallback 재주입을 끊기 위한 수술이다.
  if (!metadata?.founder_route && plain) {
    recordConversationTurn(key, 'assistant', plain);
  }
}
```

### 2) attachment meta builder 추가
파일 ingest 결과를 founder 기본 경로용 metadata로 직접 넘깁니다.

```js
function buildCurrentAttachmentMeta(ingestResults = []) {
  const current_attachment_contexts = [];
  const current_attachment_failures = [];

  for (const r of ingestResults) {
    if (r?.ok) {
      const summary =
        String(r?.summary || r?.text || r?.extracted_text || '').trim().slice(0, 2000);
      current_attachment_contexts.push({
        filename: r?.filename || null,
        summary,
      });
    } else {
      current_attachment_failures.push({
        filename: r?.filename || null,
        reason: r?.errorCode || 'read_failed',
      });
    }
  }

  return { current_attachment_contexts, current_attachment_failures };
}
```

### 3) mention / DM meta에 founder_route + attachment meta 추가
두 경로 모두 아래처럼 추가합니다.

```js
const attachmentMeta = buildCurrentAttachmentMeta(ingestResults);

const meta = {
  source_type: 'direct_message', // mention이면 channel_mention
  slack_route_label: 'dm_ai_router', // mention이면 mention_ai_router
  founder_route: true,
  channel: event.channel,
  user: event.user,
  ts: event.ts,
  thread_ts: event.thread_ts || null,
  event_id: body?.event_id || null,
  has_files: files.length > 0,
  file_count: files.length,
  attachment_ingest_success_count: successCount,
  attachment_ingest_failure_count: failureCount,
  ...attachmentMeta,
};
```

그리고 기록부 호출은 그대로 두되 founder_route 플래그를 타게 합니다.

```js
recordInboundSlackExchange(meta, combinedText || dmText, { ...answer, text: payload.text });
```

### 이 수정의 의미
- 첨부 실패도 같은 자연어 표면에서 설명 가능
- 예전 assistant 출력이 다음 턴 프롬프트를 오염시키지 않음
- "1분 차이로 말투가 튀는" 비결정성의 큰 원인 하나를 제거

---

## C. `src/founder/founderConversationState.js`
### 목표
- 기본 저장 위치를 repo 내부 `data/`에서 완전히 떼어냄
- structured artifact 회귀 파이프가 state를 써도 repo 오염이 안 나게 함

### 교체 코드
```js
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function resolveRuntimeRoot() {
  const explicitDir = String(process.env.COS_RUNTIME_STATE_DIR || '').trim();
  if (explicitDir) {
    return path.isAbsolute(explicitDir) ? explicitDir : path.resolve(PROJECT_ROOT, explicitDir);
  }
  return path.join(os.tmpdir(), 'g1cos-runtime');
}

export function resolveFounderConversationStatePath() {
  const explicitFile = String(process.env.FOUNDER_CONVERSATION_STATE_FILE || '').trim();
  if (explicitFile) {
    return path.isAbsolute(explicitFile) ? explicitFile : path.resolve(PROJECT_ROOT, explicitFile);
  }
  return path.join(resolveRuntimeRoot(), 'founder-conversation-state.json');
}
```

### 이 수정의 의미
- Git 추적 제거만으로 끝나지 않고, 실행 위치도 repo 밖으로 분리
- 로컬 테스트/운영 재시작 흔적이 저장소 주변에 남지 않음

---

## D. `src/features/founderSurfaceGuard.js`
### 목표
- legacy marker가 보이면 통째로 SAFE_FALLBACK으로 떨어지는 fail-closed 동작을 완화
- 본문을 살릴 수 있으면 최대한 살림

### 교체 코드
`thinFounderSlackSurface`만 아래처럼 바꿉니다.

```js
export function thinFounderSlackSurface(text) {
  let out = stripTransportJsonErrorBlobs(String(text || '').trim());
  if (!out) return SAFE_FALLBACK_TEXT;

  // 이전처럼 "조금만 이상해도 전체 fallback" 하지 말고
  // 가능한 본문을 최대한 살린다.
  out = sanitizeFounderOutput(out, {});
  out = String(out || '').trim();

  return out || SAFE_FALLBACK_TEXT;
}
```

### 이 수정의 의미
- Council heading이 일부 섞여도 본문 전체가 generic fallback으로 죽지 않음
- 대표 체감상 "또 봇답변" 빈도를 크게 줄일 수 있음

---

## E. `src/features/cosNaturalPartner.js`
### 목표
- founder 기본 경로의 no-route prompt를 더 짧고 자연스럽게
- “비서실장형 조언자” 메타를 줄이고 ChatGPT형 대화에 가깝게

### no-route 분기 교체
기존 route === null 쪽 프롬프트를 아래로 바꿉니다.

```js
const instructions = routeInject
  ? `
당신은 G1.ART의 COS다. 내부 오케스트레이션을 대표에게 드러내지 않는다.
응답은 한국어 평문으로 짧고 직접적으로 한다.
위원회/페르소나/보고서 목차/내부 처리 정보는 쓰지 않는다.
${getExecutiveHonorificPromptBlock()}
채널 힌트: ${hint}
${priorBlock}
`.trim()
  : `
당신은 대표와 Slack에서 직접 대화하는 ChatGPT형 COS다.
한국어로 자연스럽고 짧게 답하라.
첨부를 읽은 정보가 있으면 그 내용만 반영하라.
첨부를 읽지 못했으면 그 사실만 짧게 말하고, 재업로드 또는 다른 형식을 간단히 요청하라.
위원회, 페르소나 라벨, 보고서 목차, 내부 시스템 설명은 쓰지 마라.
${getExecutiveHonorificPromptBlock()}
${priorBlock}
`.trim();
```

### 이 수정의 의미
- style wrapper가 덜 딱딱해짐
- "너가 아니라 봇 같다"는 느낌을 줄임

---

# 이 패치에서 반드시 함께 해야 할 운영 조치

코드만 바꾸고 기존 오염된 런타임 파일을 그대로 두면 다시 섞일 수 있습니다.

## 배포 전 삭제
다음 파일은 삭제하고 재기동하세요.

```bash
rm -f data/slack-conversation-buffer.json
rm -f data/founder-conversation-state.json
rm -f data/document-context.json
rm -f data/inbound-turn-trace.jsonl
```

repo 밖 runtime dir을 쓰게 바꾼 뒤에는, 그 runtime dir도 한 번 비우고 재기동하는 편이 안전합니다.

예:
```bash
rm -rf /tmp/g1cos-runtime
```

---

# acceptance 기준

다음 네 개가 모두 만족되어야 Slack 재시험 가치가 있습니다.

1. 같은 founder 질문 3회 반복 시 말투와 구조가 거의 흔들리지 않음
2. PNG / DOCX / PDF 실패 시 모두 같은 자연어 표면에서 짧게 안내
3. founder reply가 다시 transcript buffer를 오염시키지 않음
4. repo 내부 `data/`를 지워도 founder 기본 경로가 정상 동작

---

# owner actions
- patch branch 생성
- 위 5개 파일 수정
- polluted runtime files 삭제
- `npm test`
- 로컬 Slack DM 3회 반복 smoke test
  - 일반 질문
  - 이미지 실패
  - 문서 실패
- 답변 스타일 흔들림이 사라졌는지 확인
