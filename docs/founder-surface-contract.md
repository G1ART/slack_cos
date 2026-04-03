# Founder surface contract (zero-command)

## 원칙

- 창업자-facing 표면은 단일 자연어. 업무/계획 등록 문법·council·command router는 실행 원리로 노출하지 않음.
- 맥락은 **트랜스크립트·스레드 런/스페이스 인테이크**에서만 로드하고, 발화를 워크 오브젝트로 강제 해석하지 않음 (`founderMinimalWorkContext`).

## 4단계 (vNext.12)

1. Transcript / thread context 로드 (trace에 `transcript_ready` 등).
2. 결정론 유틸 — 단, `detectFounderLaunchIntent`가 참이면 유틸에서 빠져 launch gate로 넘김 (`founderDeterministicUtilityResolver.js`).
3. Launch / scope-lock gate (`maybeHandleFounderLaunchGate`).
4. 자연어 파트너 (`callText` 있음) 또는 생성 경로 없을 때 짧은 COS 폴백 문구.

## 비창업자

`founderRoute === false`인 채널 등에서만 헌법 파이프라인·골드 스펙·워크 오브젝트 분기. 테스트는 `source_type: 'channel'`로 구분.

## 금지어

회귀: `scripts/test-vnext12-founder-and-planner.mjs` 계열 — 업무등록, 계획등록, 협의모드, 페르소나, council, command router 등.

## trace 불변식

`legacy_command_router_used === false` (창업자 응답 `buildResult`).
