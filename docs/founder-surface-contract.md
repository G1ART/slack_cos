# Founder surface contract (zero-command)

## 원칙

- 창업자-facing 표면은 단일 자연어. 업무/계획 등록 문법·council·command router는 실행 원리로 노출하지 않음.
- 맥락은 **트랜스크립트·스레드 런/스페이스 인테이크**에서만 로드하고, 발화를 워크 오브젝트로 강제 해석하지 않음 (`founderMinimalWorkContext`).

## 대화 파이프라인 (vNext.13.4 / 13.5 — 정본)

구현 모듈: `src/founder/founderDirectKernel.js` → `runFounderDirectKernel`.

1. **Durable state + context** — `getFounderConversationState`, `synthesizeFounderContext` (transcript는 보조). **vNext.13.6**: Slack 첨부(DOCX/PDF/PNG)는 `ingestSlackFile` 후 `latest_file_contexts`에 기록되고 `recent_file_contexts`·플래너 입력에 반영; 실행·승인과 혼동하지 않음.
2. **Planner 턴** — `planFounderConversationTurn` (structured LLM / mock / partner 폴백). sidecar에 `proposal_artifact` / `approval_artifact` / `execution_artifact` / `state_delta`.
3. **Artifact-gated launch** — `tryArtifactGatedExecutionSpine`: `evaluateExecutionSpineEligibility`가 **턴 직전 persisted durable state**(`buildPersistedEligibleLineageView`)만으로 `validateExecutionArtifactForSpine` 통과할 때만 `runFounderLaunchPipelineCore` 호출. 같은 턴 merged sidecar lineage 로는 불가(vNext.13.5b). **원문만으로 launch 불가.**
4. **제안·승인 표면** — `buildProposalPacketFromSidecar` + `formatFullFounderProposalSurface`; 외부 실행 태스크가 있을 때만 승인 패킷 섹션. `proposal_execution_contract` / `proposal_contract_trace` 유지.

**운영 메타 (SHA/Cursor/Supabase 등)**: `runFounderDirectKernel`에서 **`metadata.founder_explicit_meta_utility_path === true`일 때만** 결정론 유틸 숏서킷. 일반 대표 발화는 플래너 경로.

**레거시 회귀 전용**: raw-text launch intent는 `src/legacy/founderLaunchIntentRawText.js` — 프로덕션 `src/core`·`src/founder`에서 import 금지.

## 비창업자

`founderRoute === false`인 채널 등에서만 헌법 파이프라인·골드 스펙·워크 오브젝트 분기. 테스트는 `source_type: 'channel'`로 구분.

## 금지어

회귀: `scripts/test-vnext12-founder-and-planner.mjs` 계열 — 업무등록, 계획등록, 협의모드, 페르소나, council, command router 등.

## trace 불변식

`legacy_command_router_used === false`, `founder_classifier_used === false`, `founder_keyword_route_used === false` (창업자 제안 커널 trace).

## 실행 상태 질문 (vNext.12.1)

진행·핸드오프 관련 결정론 유틸은 **`truth_reconciliation` 요약 줄 + `buildProviderTruthSnapshot`** 만 사용. 레인 아웃바운드 상태나 에이전트 자기 서술을 그대로 창업자 면에 붙이지 않음.

## 완료·클로저 (vNext.13.3)

“끝났나?” 등은 `founderTruthClosureWording` + `evaluateExecutionRunCompletion`만 사용. **`truth_reconciliation.entries`가 없으면 완료로 단정하지 않는다.** 문구 축: 완료 / 초안만 준비됨 / 일부만 확인됨 / 아직 미완료.
