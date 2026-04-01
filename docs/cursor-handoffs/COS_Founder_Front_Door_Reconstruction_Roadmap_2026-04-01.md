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

## 다음 배치(Phase 2~) — 우선순위

1. ~~파이프라인 커널 확장~~ → **1b 완료**; 잔여: 트레이스 필드 보강·`topLevelRouter` 등 아래 항목.
2. **`cosDialogueWriter.js` / `hiddenContractExtractor.js`** 도입 (지시문 §4).
3. **`topLevelRouter`:** sanitizer 축소·hard fail 강화 (지시문 P0).
4. **트레이스:** 지시문 §8 필드 전부 채우기 (`passed_renderer`, `passed_outbound_validation` 등).
5. **머지 게이트:** Gold A~E + founder route council 0회 자동 검증 스크립트 고정.

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
