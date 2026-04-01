# COS Conversation Contract Gold v1

## 1) Founder-facing 모드

- **Mode A — COS Dialogue Mode**
  - 문제 재정의, 벤치마크 축, MVP 범위/제외, 리스크/검증, 합의 질문, next-step 제공
  - kickoff/follow-up/pushback/scope-lock 이전 턴에서 기본 모드
- **Mode B — Harness Orchestration Mode**
  - scope lock 충족 후 project/run/workstream handoff
  - provider truth, blocker, founder next action을 패킷으로 보고

## 2) 하드페일 매트릭스 (Founder route)

- `responder === 'council'` → 즉시 fallback
- Council/internal metadata marker 탐지 → 즉시 fallback
- kickoff 계열 응답에서 generic clarification 문구 탐지 → 즉시 fallback

## 3) Scope Lock 최소 요건

다음 필드가 패킷에 존재할 때만 lock으로 간주:
- 프로젝트명/가칭
- 문제 정의
- 타겟 사용자
- MVP 범위
- 제외 범위
- 핵심 가설
- 성공 지표
- 리스크
- 초기 아키텍처 방향
- 추천 실행 순서
- founder 승인 필요 여부

## 4) Founder 출력 패킷 템플릿

- **Scope Lock Packet**
  - 위 최소 요건 + `packet_id` + `run_id`
- **Status Report Packet**
  - 현재 단계 / 완료 / 진행 중 / blocker / provider truth / 다음 작업 / founder action
- **Execution Handoff Packet**
  - 프로젝트 참조 / run 참조 / dispatched workstreams / provider truth / founder next action

## 5) Gold 테스트셋

`scripts/tests-constitutional/test-founder-gold-spec-v1.mjs`에서 exact prompts 7종을 검증:
- kickoff
- follow-up narrowing
- pushback realism
- scope lock request
- meta debug one-line
- status packet
- approval handoff
