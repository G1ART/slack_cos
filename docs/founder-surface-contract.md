# Founder surface contract (zero-command)

## 원칙

- 창업자-facing 표면은 단일 자연어. 업무/계획 등록 문법·council·command router는 실행 원리로 노출하지 않음.
- 맥락은 **트랜스크립트·스레드 런/스페이스 인테이크**에서만 로드하고, 발화를 워크 오브젝트로 강제 해석하지 않음 (`founderMinimalWorkContext`).

## 4단계 (vNext.13)

1. **Context synthesis** — `synthesizeFounderContext` (트랜스크립트·인테이크·런/스페이스 힌트; 워크오브젝트 파서로 발화를 강제 분류하지 않음).
2. 결정론 유틸 — 단, `detectFounderLaunchIntent`가 참이면 launch gate로 넘김 (`founderDeterministicUtilityResolver.js`).
3. Launch gate (`maybeHandleFounderLaunchGate`) — 스레드 맥락만 사용 (`launchMinimalWorkContext`).
4. **Proposal packet** — `buildProposalFromFounderInput` + `formatFullFounderProposalSurface`; 동일 턴에서 `callText`가 있으면 패킷 아래 *대화형 보강*으로만 LLM 호출 (`runFounderProposalKernelTurn`).

## 비창업자

`founderRoute === false`인 채널 등에서만 헌법 파이프라인·골드 스펙·워크 오브젝트 분기. 테스트는 `source_type: 'channel'`로 구분.

## 금지어

회귀: `scripts/test-vnext12-founder-and-planner.mjs` 계열 — 업무등록, 계획등록, 협의모드, 페르소나, council, command router 등.

## trace 불변식

`legacy_command_router_used === false`, `founder_classifier_used === false`, `founder_keyword_route_used === false` (창업자 제안 커널 trace).

## 실행 상태 질문 (vNext.12.1)

진행·핸드오프 관련 결정론 유틸은 **`truth_reconciliation` 요약 줄 + `buildProviderTruthSnapshot`** 만 사용. 레인 아웃바운드 상태나 에이전트 자기 서술을 그대로 창업자 면에 붙이지 않음.
