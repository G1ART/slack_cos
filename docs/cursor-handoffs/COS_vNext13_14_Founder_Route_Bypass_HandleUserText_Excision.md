# COS vNext.13.14 — Founder Route Bypass / `handleUserText` Excision / Single Egress Lockdown
# Base: main @ c485fa8
# Intent: founder Slack path를 레거시 앱/좀비 분기 세계에서 완전히 분리해서,
# “Slack 안의 ChatGPT형 COS”를 독립 spine으로 재구축한다.
#
# 이번 패치는 보강이 아니라 분리다.
# founder route는 더 이상 거대한 `handleUserText` 세계에 들어가면 안 된다.
# founder route는 오직:
#   Slack founder event
#     -> founderSlackController
#     -> runFounderDirectKernel
#     -> sendFounderResponse
# 만 허용한다.

---

## 0. 왜 이번엔 이 패치를 해야 하는가

대표가 보여준 실제 실패는 두 가지다.

1. 첨부 실패는 현재 로그상으로 founder natural path에서 자연어화되고 있다.
2. 그런데 Council 응답은 Slack에 실제로 보였는데, 제공된 Railway 로그 묶음에는 그 턴의 `founder_output_trace`가 없다.

이 조합이 뜻하는 것:
- 첨부 문제는 transport/fetch 층의 별도 문제다.
- Council 문제는 founder natural path 밖 어딘가에서 **우회 송신 경로**가 살아 있다는 뜻일 가능성이 높다.
- 즉 founder 경로를 `handleUserText`와 같은 거대 레거시 해석기 안에 둔 채로는 닫히지 않는다.

이번 패치의 핵심 가정:
> founder route에서 Council이 보였는데 `founder_output_trace`가 없다면,
> founder 응답이 `sendFounderResponse`를 거치지 않은 다른 송신 경로에서 나갔을 가능성을 가장 강하게 봐야 한다.

이 가정은 확정판결이 아니라 **패치 설계 가정**이다.
하지만 지금 단계에서는 이 가정을 기준으로 코드를 잠그는 것이 맞다.

---

## 1. 목표 상태

Founder Slack DM / founder mention의 동작은 아래 하나뿐이다.

```text
Slack founder event
-> parse raw text + current-turn attachments
-> founderSlackController
-> runFounderDirectKernel
-> sendFounderResponse
-> Slack outbound
```

아래는 founder route에서 **금지**다.

- `handleUserText`
- `runInboundAiRouter`
- `runInboundCommandRouter`
- council / proposal / approval / packet renderer
- intake-confirm / plan-confirm / queue-confirm surface
- founder text를 직접 `say()` 또는 `client.chat.postMessage()`로 보내는 경로
- founder output trace 없이 나가는 모든 응답

오케스트레이션은 founder 응답 생성 경로가 아니라, founder 응답 이후 별도 실행층에서 일어나야 한다.

---

## 2. 비타협 원칙

1. founder route는 **텍스트 의미를 앱 코드가 해석하지 않는다**.
2. founder route는 **legacy app 해석기(`handleUserText`)를 호출하지 않는다**.
3. founder route outbound는 **`sendFounderResponse`만 허용**한다.
4. founder route에서 Council 헤더/페르소나 라벨이 감지되면 **보내지 말고 에러로 막는다**.
5. founder route에서 응답을 보냈는데 `founder_output_trace`가 없으면 **그 자체를 장애로 간주**한다.

---

## 3. 수정 대상

반드시 수정:
- `src/slack/registerHandlers.js`
- `src/core/founderOutbound.js`
- `src/founder/founderDirectKernel.js`
- `app.js`

신규 추가 권장:
- `src/founder/founderSlackController.js`
- `src/founder/founderEgressLock.js`

필요 시 정리:
- founder route에서만 쓰이는 legacy helper import 제거
- docs/HANDOFF.md
- docs/RELEASE_LOCK.md
- 신규 handoff 문서

---

## 4. 구현 — 핵심 수술

### A. `registerHandlers.js` — founder route에서 `handleUserText` 완전 제거

#### A1. 새로운 founder 전용 컨트롤러를 도입
신규 파일 `src/founder/founderSlackController.js` 생성.

역할:
- raw founder text 수집
- current-turn attachment ingest
- founder metadata 구성
- `runFounderDirectKernel(...)` 호출
- 결과를 `sendFounderResponse(...)`로만 송신

주의:
- 이 컨트롤러는 `handleUserText`를 import하지 않는다.
- `say(...)` 또는 `client.chat.postMessage(...)`로 직접 텍스트를 보내지 않는다.
- founder route에서 outbound는 오직 `sendFounderResponse(...)`.

#### A2. DM / mention founder 경로 교체
기존 founder DM/mention 처리에서
```js
const answer = await handleUserText(combinedText, meta);
```
같은 호출이 있다면 전부 제거하고, 아래처럼 교체한다.

```js
const answer = await handleFounderSlackTurn({
  rawText: combinedText || dmText,
  files,
  client,
  body,
  event,
  routeLabel: 'mention_ai_router', // DM이면 dm_ai_router
});

await sendFounderResponse({
  client,
  channel: event.channel,
  thread_ts: event.thread_ts || event.ts,
  answer,
  metadata: answer?.metadata || {},
});
```

핵심:
- founder route는 더 이상 app-level `handleUserText`를 지나지 않는다.
- founder route의 의미 해석은 `runFounderDirectKernel` 내부의 단일 chat spine만 사용한다.

---

### B. `app.js` — `handleUserText` founder route 금지

이 패치의 핵심은 “삭제”지만, 회귀 방지를 위해 **방어벽**도 필요하다.

`handleUserText(...)` 초반에 아래 가드를 넣어라.

```js
export async function handleUserText(text, metadata = {}) {
  if (metadata?.founder_route === true) {
    const err = new Error('founder_route_must_not_use_handleUserText');
    err.code = 'founder_route_must_not_use_handleUserText';
    throw err;
  }

  // 이하 legacy / non-founder path만 허용
  ...
}
```

의도:
- 누가 다시 founder route를 `handleUserText`에 연결해도 즉시 터지게 한다.
- founder path 회귀를 테스트보다 먼저 런타임에서 잡는다.

#### B2. founder path 관련 legacy import 차단
`app.js`에서 founder route 처리 때문에 살아 있던
- `runInboundAiRouter`
- `runInboundCommandRouter`
- council / proposal / execution confirm surface
- planning / queue / packet helper
가 founder path를 위해 로드될 필요가 없으면 제거하라.

이상적 목표:
- founder path는 `app.js`에서 아예 처리하지 않거나,
- 최소한 `app.js`는 founder route를 외부 controller로 넘기고 바로 빠진다.

---

### C. `src/founder/founderSlackController.js` — founder ingress의 단일화

신규 컨트롤러 골격:

```js
import { founderIngestSlackFilesWithState, buildFounderTurnAfterFileIngest, buildCurrentAttachmentMetaFromIngest } from '../features/founderSlackFileTurn.js';
import { summarizePngBufferForFounderDm } from '../features/founderDmImageSummary.js';
import { runFounderDirectKernel } from './founderDirectKernel.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';

export async function handleFounderSlackTurn({
  rawText,
  files = [],
  client,
  event,
  body,
  routeLabel,
}) {
  const threadKey = buildSlackThreadKey({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    ts: event.ts,
    user: event.user,
  });

  const ingestResults = files.length
    ? await founderIngestSlackFilesWithState({
        files,
        client,
        threadKey,
        summarizePng: summarizePngBufferForFounderDm,
        persistToFounderState: false,
        persistToDocumentContext: false,
      })
    : [];

  const turn = buildFounderTurnAfterFileIngest(ingestResults, rawText);
  const attachmentMeta = buildCurrentAttachmentMetaFromIngest(ingestResults);

  const metadata = {
    founder_route: true,
    slack_route_label: routeLabel || null,
    source_type: event.channel_type === 'im' ? 'direct_message' : 'channel_mention',
    channel: event.channel,
    user: event.user,
    ts: event.ts,
    thread_ts: event.thread_ts || event.ts,
    event_id: body?.event_id || null,
    has_files: files.length > 0,
    file_count: files.length,
    attachment_ingest_success_count: ingestResults.filter(x => x?.ok).length,
    attachment_ingest_failure_count: ingestResults.filter(x => !x?.ok).length,
    failure_notes: turn.failureNotes || [],
    ...attachmentMeta,
  };

  return runFounderDirectKernel({
    text: turn.modelUserText || rawText || '',
    metadata,
    route_label: routeLabel || null,
  });
}
```

핵심:
- founder ingress는 current-turn only
- current attachments만 반영
- side effect 없음
- legacy app 통과 없음

---

### D. `src/core/founderOutbound.js` — founder egress 단일화 + hard veto

지금은 thin sanitize가 있지만, 그걸로는 Council이 새는 순간을 놓친다.
이번엔 **송신 금지**가 필요하다.

#### D1. hard block marker set 추가
다음 문자열이 최종 founder text에 하나라도 있으면 예외로 막아라.

```js
const FOUNDER_EGRESS_BLOCK_MARKERS = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장 / 미해결 충돌',
  '핵심 리스크',
  '다음 행동',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '협의 모드',
  '참여 페르소나',
  'strategy_finance',
  'risk_review',
  'ops_grants',
  'product_ux',
];
```

#### D2. caller/source required
`sendFounderResponse(...)` 호출 시 반드시
- `metadata.founder_route === true`
- `metadata.founder_surface_source`
- `metadata.pipeline_version`
- `metadata.egress_caller`
를 요구해라.

없으면 예외 throw.

#### D3. egress trace required
송신 직전 아래 trace를 강제하라.
- `text_hash`
- `rendered_preview`
- `contains_block_markers`
- `egress_caller`
- `runtime_sha`
- `boot_id`
- `instance_id`

그리고 founder route 메시지를 보냈는데 이 trace 기록이 실패하면 **실제 Slack 송신도 중단**하라.

#### D4. sendFounderResponse 외 founder 송신 금지
가능하면 `founderEgressLock.js`를 만들어, founder route에서 다른 모듈이 직접 `chat.postMessage`를 부르려 하면 예외를 던지게 하라.

최소 형태 예시:
```js
export function assertFounderEgressOnly(metadata, caller) {
  if (metadata?.founder_route !== true) return;
  if (caller !== 'sendFounderResponse') {
    const err = new Error('founder_egress_bypass_detected');
    err.code = 'founder_egress_bypass_detected';
    throw err;
  }
}
```

완전한 monkey patch가 부담되면, founder route 코드베이스에서 송신은 모두 `sendFounderResponse`만 import하도록 정리하라.

---

### E. `src/founder/founderDirectKernel.js` — founder 대화만 남기고 나머지는 금지

이 파일은 이미 많이 얇아졌지만, 이번 패치에서 더 명확히 한다.

#### E1. founder 응답은 오직 direct chat
`runFounderDirectKernel`의 정상 founder path는 무조건:
- `normalizeFounderMetaCommandLine`
- optional deterministic utility (명시 utility path일 때만)
- `runFounderNaturalChatOnly`
뿐이어야 한다.

여기에
- proposal 생성
- approval packet
- launch gate
- artifact pipeline
- structured planner fallback
이 섞이면 안 된다.

#### E2. trace를 더 강하게
trace에 아래를 추가:
- `founder_legacy_world_bypassed: true`
- `handle_user_text_bypassed: true`
- `egress_contract_required: true`

---

## 5. 삭제할 것

### founder route에서 제거
- `handleUserText` 호출
- founder route용 `callJSON`
- founder route용 council/planner/proposal helper
- founder route assistant transcript buffering
- founder route direct `say` / `chat.postMessage`

### 남겨도 되는 것
- non-founder legacy / ops / admin path의 `handleUserText`
- structured planner 회귀 harness
- artifact / approval regression tests
단, founder route와 코드/egress를 공유하면 안 된다.

---

## 6. 테스트 — 이번 패치의 핵심

### T1. founder route never calls handleUserText
신규:
`scripts/test-vnext13-14-founder-route-bypasses-handleUserText.mjs`

검증:
- founder mention / DM mock event 처리
- `handleUserText` spy count === 0

### T2. founder route only uses sendFounderResponse
신규:
`scripts/test-vnext13-14-founder-single-egress.mjs`

검증:
- founder turn 처리 시
  - `sendFounderResponse` 1회
  - direct `say` / `chat.postMessage` 0회

### T3. council markers blocked at egress
신규:
`scripts/test-vnext13-14-founder-council-egress-blocked.mjs`

검증:
- final text에 `한 줄 요약` 또는 `페르소나별 핵심 관점`이 있으면
- `sendFounderResponse`가 Slack 송신 전에 `founder_council_egress_blocked` throw

### T4. founder output trace required
신규:
`scripts/test-vnext13-14-founder-egress-trace-required.mjs`

검증:
- founder route response에서 trace metadata 누락 시 송신 실패

### T5. founder route current-turn attachment only still works
기존 첨부 테스트 유지:
- founder route가 `handleUserText`를 안 타도
- attachment success/failure naturalization이 유지되어야 함

### T6. no founder legacy imports in controller path
신규:
`scripts/test-vnext13-14-founder-controller-import-chain.mjs`

검증:
- `founderSlackController.js` import chain에
  - `handleUserText`
  - `runInboundAiRouter`
  - `runInboundCommandRouter`
  - council/planner helper
가 없음을 문자열/AST 수준으로 확인

---

## 7. acceptance 기준

아래를 모두 만족해야 한다.

1. founder DM / mention은 절대로 `handleUserText`를 호출하지 않음
2. founder 응답은 절대로 `sendFounderResponse` 외 경로로 송신되지 않음
3. Council 헤더/페르소나 라벨이 포함된 founder text는 Slack으로 못 나감
4. founder 응답이 Slack에 보이면 반드시 matching `founder_output_trace`가 존재
5. founder route 첨부 성공/실패 자연화는 유지
6. 텍스트-only founder 대화는 지금처럼 direct natural chat 유지
7. founder route와 legacy app route가 코드 구조상 분리되어 있음

---

## 8. owner actions

패치 완료 후 반드시 아래를 출력:
1. 새 founder controller 경로 설명
2. founder route에서 제거된 함수 목록
3. founder egress hard block 추가 내역
4. 테스트 결과
5. 배포 후 대표가 확인할 3개 로그 키
   - `founder_output_trace`
   - `founder_council_egress_blocked`
   - `founder_route_must_not_use_handleUserText`

---

## 9. 한 줄 목표

이번 패치의 목표는
“founder 메시지가 더 이상 거대한 레거시 `handleUserText` 세계로 들어가지 못하게 막고,
Slack 안의 COS를 독립된 대화 spine으로 분리하며,
Council 류 출력이 founder egress에서 한 글자도 못 나가게 잠그는 것”
이다.
