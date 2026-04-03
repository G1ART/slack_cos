# Release lock — vNext.13.3 (Founder contract hardening)

이 문서는 **기능 추가가 아니라** 창업자 면·승인·정본·부록에 대한 **회귀 방지 불변식**을 고정한다. 다음 패치에서 이 계약을 깨는 변경은 의도적 릴리스가 아니면 피한다.

## 1. Founder surface authority chain

1. `app.js` `handleUserText`: `resolveFounderRouteDecision(metadata).founder_route === true` 이면 **오직** `runFounderDirectKernel` → `founderDirectInboundFourStep` (결정론 유틸 → launch gate → 제안 커널). `runInboundCommandRouter` / `runInboundAiRouter` 미도달.
2. `runInboundAiRouter`: 동일 SSOT(`src/founder/founderRouteInvariant.js`)로 founder면 **방어적 하드 가드**로 커널만 호출.
3. 오퍼레이터·채널: `founderRequestPipeline` (창업자 자연어 생성 경로와 물리 분리).

## 2. Founder entry invariant 요약

- 판정 규칙은 **`founderRouteInvariant.js` 한 곳**만: `direct_message` / `channel_mention` / 라벨 `dm_ai_router`·`mention_ai_router` / 채널 `D*` .
- `traceFounderRouteInvariant(metadata)`로 audit에 `founder_entry_ssot`를 남길 수 있다.

## 3. Approval contract 요약

- `buildFounderApprovalPacket` / 승인 패킷 가시 섹션은 **`external_execution_tasks.length > 0`일 때만**.
- 내부 분류 필드: `proposal_execution_contract` — `COS_ONLY` | `APPROVAL_REQUIRED` | `EXECUTION_READY` (`authorized`일 때만 READY).
- 문서·리서치·초안 vs 외부 mutation: `founderProposalKernel.js`의 보조 정규식 + **스코프 락 신호** + `proposal_contract_trace.reasons`로 디버깅 가능하게 유지.
- 외부 mutation / 오케스트레이션 실행은 **`external_execution_authorization.state === 'authorized'`** 만 허용 (기존 default-deny 유지).

## 4. Completion contract 요약

- `evaluateExecutionRunCompletion`: `truth_reconciliation.entries`가 없으면 **레인 outbound로 completed 추론 안 함** — `pending` + `completion_source: 'truth_reconciliation'`.
- 엔트리가 있으면 `deriveExecutionCompletionFromTruthReconciliation`이 정본; 경로별 `satisfied` / `draft_only` / `unsatisfied` (주석 참고: `truthReconciliation.js`).
- 창업자에게 “끝났나?” 류: `founderDeterministicUtilityResolver` + `founderTruthClosureWording` — **정본 없으면 “완료” 단정 금지**.
- 대표 문구 축: 완료 / 초안만 준비됨 / 일부만 확인됨 / 아직 미완료 (`founderTruthClosureWording.js`).

## 5. Advisory contract 요약

- 기본 **꺼짐**: `COS_GOVERNANCE_ADVISORY=1`일 때만 후보 생성.
- 제안·승인·런치·실행·상태·핸드오프 등 **표준 창업자 서피스**에서는 부록 **금지** (`cosGovernanceAdvisory.js`의 forbidden set).
- 부록은 **최대 1개**, 길이 상한 `GOVERNANCE_ADVISORY_MAX_CHARS`, 본문보다 길면 잘라 붙이지 않음(`founderDirectKernel`).
- 회귀에서 허용 표면은 `GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE` **전용**(단위 테스트만).

## 6. Forbidden regressions

- 창업자 면에 council / classifier / 내부 라우터 메타 노출.
- `founder_route` 우회로 command·AI 라우터 진입.
- `truth_reconciliation` 없이 창업자에게 “완료” 확정 서술.
- 단어 한두 개·짧은 PR/배포 한 줄만으로 `external_execution_tasks` 남발.
- 승인 게이트 완화(`authorized` 외 허용).
- 운영 조언 부록이 기본 켜짐 또는 제안 본문을 덮어씀.

## 7. 다음 패치 전까지 건드리면 안 되는 핵심 불변식

1. `founderRouteInvariant.js` SSOT — 이중 정의 금지.
2. 승인 패킷 = 외부 실행 태스크 있을 때만.
3. completion = truth 정본 우선, 무없음 폴백 시 과장 금지.
4. governance advisory = env + 서피스 + 길이 예산.
5. `proposal_execution_contract` + `proposal_contract_trace` 필드 제거·무력화 금지(회귀 진단용).

## Provider별 satisfied (요약)

- 상세 규칙은 `truthReconciliation.js`·`providerTruthSnapshot.js`·플랜 라우트 정책을 따른다. 엔트리 `reconciled_status === 'satisfied'`는 **해당 경로에 대해 플랜 대비 관측 ref가 계약을 충족**했을 때만; Cursor 등은 handoff·live ref 등 복합 조건이 있을 수 있다(환경별 `draft_only`/`partial` 빈번).
