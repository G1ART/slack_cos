# Founder front door 재건축 — 실행 로드맵 (2026-04-01)

**권위:** 제품·빌드 순서는 `00_Document_Authority_Read_Path.md`. 파일 우선순위·머지 게이트는 `Slack_COS_Reconstruction_File_by_File_Patch_Priority_2026-04-01.md`.

---

## 이번 야간 배치(Phase 1a)에서 한 일

| 항목 | 상태 |
|------|------|
| `founderRequestPipeline`이 `QUERY_LOOKUP`·`STRUCTURED_COMMAND`를 **null로 위임** → 조회/구조화 명령이 대화 패킷으로 삼켜지지 않음 | 완료 |
| Founder 경로에서 실행기(`routeToExecutor`) **null**이면 **dialogue 계약 폴백** (레거시 AI로 새지 않음) | 완료 |
| `runInboundAiRouter` **최상단에서 `founder_route` 진입 차단** (방어적) | 완료 |
| `app.js` **G1COS_FOUNDER_DOOR** JSON 로그 + `inbound_audit`를 inbound-turn-trace JSONL에 병합 | 완료 |
| Founder **deterministic fallback** 안내 문구 정리 | 완료 |
| Golden path: `계획상세:` → pipeline `null` 회귀 | 완료 |

## Phase 1b — 파이프라인 pre-AI 스파인 (완료)

| 항목 | 상태 |
|------|------|
| `founderRequestPipeline` **3b**: `runInboundCommandRouter`와 동일 축 — 인테이크 취소 → execution spine(소유 스레드) → 활성 인테이크 시 `tryFinalizeProjectSpecBuildThread` → clean `start_project` door → `tryExecutiveSurfaceResponse` | 완료 |
| 위 결과를 **`buildPipelineExecutivePassthrough`** + `executive_kickoff_surface`로 래핑, trace에 `pipeline_response_type`·`packet_id` 등 병합 | 완료 |
| **골드 계약 우선:** `start_project` 표면 분류가 **킥오프·scope lock** 골드 문장과 겹치면 executive 선점 생략 (`classifySurfaceIntent` + `classifyGoldContract`) | 완료 |
| 헌법 골드 스펙 테스트: 턴마다 **인테이크만** 리셋·**실행 run**은 테스트 4→7 연속 시나리오 유지 | 완료 |

## Phase 1c — founder 경로 command-router 축소 (완료)

| 항목 | 상태 |
|------|------|
| `app.js` founder 경로에서 pipeline miss 시에도 command router를 무조건 태우지 않고, **`QUERY_LOOKUP`/`STRUCTURED_COMMAND` 의도일 때만** command router 허용 | 완료 |
| founder 경로는 비-쿼리 miss에서 deterministic fallback으로 고정, AI router 미진입 원칙 유지 | 완료 |

## Phase 2a — topLevel hard contract 강화 (완료)

| 항목 | 상태 |
|------|------|
| `topLevelRouter` founder 경로에서 **generic clarification / council shape leak** 감지 시 sanitize로 살리지 않고 즉시 차단 | 완료 |
| `founder_output_trace`에 `passed_outbound_validation`, `validation_error_code` 필드 추가 (hard fail 원인 추적) | 완료 |

## Phase 2b — inbound-turn trace 필드 보강 (완료)

| 항목 | 상태 |
|------|------|
| `inboundTurnTrace` finalize payload에 `passed_finalize`·`passed_renderer`·`passed_sanitize`·`passed_outbound_validation`·`validation_error_code` 추가 | 완료 |
| `topLevelRouter` finalize 결과를 inbound-turn JSONL로 전파 (차단 사유를 turn 레벨에서 질의 가능) | 완료 |
| `scripts/test-inbound-turn-trace.mjs` / `scripts/test-vnext10-leak-path-council-hard-block.mjs`에 필드 회귀 검증 추가 | 완료 |

## Phase 3a — dialogue writer / hidden extractor 도입 (완료)

| 항목 | 상태 |
|------|------|
| `src/core/hiddenContractExtractor.js` 신설 — founder 입력에서 도메인/벤치마크/MVP/리스크/핵심질문 힌트 추출 | 완료 |
| `src/core/cosDialogueWriter.js` 신설 — hidden contract 기반 dialogue contract 작성기 도입 | 완료 |
| `founderGoldContract.buildDialoguePacket`가 writer 위임으로 전환 (pipeline dialogue 계약 생성 책임 분리 시작) | 완료 |

## 다음 배치(Phase 3b~) — 우선순위

1. `founderRequestPipeline`에서 `buildDialoguePacket` 직접 의존을 점진 축소하고 writer/contract 경로를 1차 소스로 통일.
2. `tryExecutiveSurfaceResponse` founder-facing start_project 작성 책임을 dialogue writer 계열로 이동(운영 큐/실행 문구 완전 분리).
3. **머지 게이트:** Gold A~E + founder route council 0회 + trace 필드 스키마 고정 자동 검증 스크립트 확정.

## 프로젝트를 접기 전에 볼 신호

- 프로덕션 로그에 `G1COS_FOUNDER_DOOR`가 **`routing_exit: pipeline`** 인데도 Council 본문이 보이면 → **배포 SHA 불일치** 또는 **Slack 핸들러가 `handleUserText`를 우회**.
- `routing_exit: founder_deterministic_fallback`이 **고빈도**면 → 파이프라인이 의도를 못 잡는 입력이 많음 → **1b 커널 확장**이 우선.

---

### Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "Phase 1b: founder pipeline pre-AI spine, executive passthrough trace, gold vs start_project defer"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

(커밋 시 `data/`·테스트 산출 `docs/cursor-handoffs/COS_Exec_Handoff_*` 등은 제외하는 것이 좋음.)
