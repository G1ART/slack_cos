# Founder surface contract (zero-command)

## 원칙

- 창업자-facing 표면은 단일 자연어 채널. 업무/계획 등록 문법, council/responder 용어, command router를 실행 원리로 노출하지 않음.
- 맥락은 트랜스크립트·프로젝트 메모리·런 상태에서 가져옴.

## 런타임 경로 (직접 채팅 ON)

`founderRequestPipeline`에서 `founderRoute`이고 `callText`가 있을 때:

1. Launch gate (`maybeHandleFounderLaunchGate`)
2. 결정론 유틸 (`tryResolveFounderDeterministicUtility`)
3. 자연어 파트너 (`runFounderNaturalPartnerTurn`)

## 비창업자 경로

채널 커맨드·구조화 명령은 operator/admin 경로에서 처리. 창업자 DM과 책임 분리.

## 금지어 (최종 사용자 텍스트)

회귀: `scripts/test-vnext11-founder-and-planner.mjs` — 업무등록, 계획등록, 협의모드, 페르소나, 참여 페르소나, responder, council, structured command, planner mode, command router.

## 관련 코드

- `app.js`
- `src/founder/founderDeterministicUtilityResolver.js`
- `src/core/founderRequestPipeline.js`
- `src/features/inboundFounderRoutingLock.js`
