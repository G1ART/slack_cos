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

## Phase 3b — founder outbound 블록 경로 제거 (완료)

| 항목 | 상태 |
|------|------|
| `sendFounderResponse`에서 founder-facing `rendered_blocks` 전송 경로를 제거하고 **text-only** 강제 | 완료 |
| block payload 존재 시 trace에 `founder_blocks_path_disabled_text_only` 기록 | 완료 |
| `scripts/test-vnext10-leak-path-council-hard-block.mjs`에 “blocks 미전송” 회귀 검증 추가 | 완료 |

## Phase 4 — Founder Gold SSOT one-shot harden (완료)

| 항목 | 상태 |
|------|------|
| `src/core/founderConversationContracts.js` 신설: 슬롯/금지/모드전환/ownership 계약 검증(대화 품질 의무 필드 포함) | 완료 |
| `src/core/founderHardFailRules.js` 신설: hard fallback 허용 사유를 `invariant_breach` / `unsupported_founder_intent` / `runtime_system_failure` 3종으로 제한 | 완료 |
| `founderRequestPipeline`에서 `tryExecutiveSurfaceResponse`/clean start door/spec finalize 의존 제거(Founder 생성 경로 레거시 단절) | 완료 |
| founder pipeline miss/unhandled/policy deny 시 permissive fallback 대신 hard-fail closed 응답으로 고정 | 완료 |
| `cosDialogueWriter` + `founderRenderer`에 반박/트레이드오프/대안/범위절삭 의무 슬롯 추가 | 완료 |
| startup provenance canary를 JSON 단일 로그로 고정(`git_sha`,`hostname`,`pid`,`instance_id`,`founder_route_mode`,`canary_render_class`,`started_at`) | 완료 |
| founder 응답 trace 전달 강화: pipeline trace -> Slack outbound trace 병합, `passed_outbound_validation`/`hard_fail_reason` 기록 | 완료 |
| one-shot acceptance gate: exact gold + 동일 프롬프트 10회 + mixed sequence 테스트를 `test-founder-gold-spec-v1.mjs`에 잠금 | 완료 |
| `app.js` founder 경로 최종 fail-closed: pipeline/command-router 결과에 Council marker가 남으면 즉시 hard kill (`pipeline_leak_hard_kill` / `command_router_leak_hard_kill`) | 완료 |
| `founderSurfaceGuard` hard fallback 문구에서 “한 번 더 보내달라” 유도 제거(Non-Negotiable A 준수) | 완료 |
| `runInboundCommandRouter`에 `structuredOnly` 모드 추가: founder에서는 lineage/query/structured 외 경로를 즉시 미스 처리 | 완료 |
| `runInboundAiRouter`에서 founder 전용 분기/파라미터 제거 + 오류 시 legacy single fallback 제거(직접 error surface) | 완료 |
| `app.js`에서 `runLegacySingleFlow` 제거 및 founder 경로에서 command-router 호출 시 `structuredOnly: true` 강제 | 완료 |

## 다음 배치(Phase 5~) — 우선순위

1. `executionSpine` 경유 표면도 founder kernel 계약(trace 필드·하드 실패 사유) 100% 동일 포맷으로 맞춤.
2. fixture replay 세트에 mixed-sequence(버전→kickoff→버전→followup→meta→status→kickoff) 고정 추가.
3. **머지 게이트:** founder route council 0회 + generic clarification 0회 + gold/repeat/mixed acceptance + startup canary 필수.

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
