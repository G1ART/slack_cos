# COS 내비게이터 (자연어 진입)

## North Star 정렬
- 비서실장 톤(`chief_stance_line`), **합의 수준**(`agreement_readiness`), **합의 후 자동 이행**(`after_agreement_autopilot`), **대표만 결정할 일**(`blocking_decisions`) 필드로 **“합의 → 이행”** 축을 드러냄.
- 역량 카테고리는 `cosCapabilityCatalog.js` 로 주입 (전체 명령 나열 금지).

## 목적
- 수십 개 명령어를 외우지 않고 **상황·목표만** 말해도 COS가 이해 정리·되묻기·다음 단계를 제안.
- Council(다중 페르소나 합성)보다 **가벼운 1회 structured JSON** 호출.

## 사용법
- `COS …` 또는 `비서 …` (첫 줄 기준, 이어서 멀티라인 가능)
- 본문 없이 `COS` / `비서` 만 → 안내 메시지 (intro)

## 라우팅 위치
- **`runInboundAiRouter`** 초반(내비 트리거 매칭 시). **Council 진입 직전** (`parseCouncilCommand` 이전).
- 조회·플래너 하드 락·구조화 명령은 **`runInboundCommandRouter`** 에서 먼저 처리됨.

## 코드
- `src/features/cosNavigator.js` — 트리거 파싱, 스키마, 포맷
- `src/features/runInboundAiRouter.js` — 내비 분기 + `finalizeSlackResponse(responder: 'navigator', council_blocked: true)`
- `src/features/topLevelRouter.js` — `navigator` 를 Council 누수 sanitize 대상에 포함

## 계획등록 복붙 초안 (2026-03-24)
- `COS` / `비서` **본문 비어 있을 때** 안내(intro)와, **내비 JSON 응답 본문** 하단에 **fenced 코드 블록**으로 `계획등록: …` 초안을 붙인다 (`buildPlanRegisterDraftLine` — 본문이 있으면 `이해한 내용`을 한 줄로 접어 넣음).
- **원클릭 Block Kit 버튼**은 아직 없음 → User Guide §1.2 로드맵.

## 다음 단계 (제품)
- 스레드 단위 **대화 상태**(이전 내비 답 참조) 저장
- 내비·조회 응답에 **`action_id` 고정 버튼** (다음 액션 한 방)
- Cursor/GitHub 와의 **자동 이어하기**는 별도 워크플로 설계
