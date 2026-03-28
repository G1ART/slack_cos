# WRK — Command media 정리 이후 최단거리 돌파 (2026-03-27)

**Authority:** Default read set는 `00_Document_Authority_Read_Path.md` — **Directive + Alignment** 만. 본 파일은 **패치 브리프**(실행 순서 제안).

## 상태 — **로컬 Executive MVP 시드 완료 (2026-03-27)**

디렉티브 **M1**(표면·라우팅·fixture)·**M2**(trace·패킷·상태)·**M3 시드**(AWQ·WRK/RUN·어댑터·증거 회수)까지 **한 슬라이스**로 운영 가능한 상태로 봄. **M4 버튼 확장·M5 호스티드 하드닝**은 범위 밖(Alignment no-go 준수).

## 북극성 (한 줄)

**의사결정·감사 spine(M2)·실행 큐(M3)·얇은 운송(M4)** 을 끊기지 않게 이어 **“완료 = 증거”** 까지 한 루프로 닫는다.

**제품 주인이 말하는 MVP 전체 루프:** `COS_MVP_Definition_Owner_2026-03-27.md` (본 WRK는 그중 **구현 최단거리**만 다룸; 빌드 잠금은 Alignment).

## 단계 (완료 체크)

| Phase | 내용 | 상태 |
|-------|------|------|
| **A — Spine** | 턴 trace · 결정/상태 패킷 · lineage | 회귀 유지 |
| **B — 폐루프** | `커서발행`/`커서결과기록` · AWQ `proof_refs` (**run 매칭 + WRK 폴백**) | **완료** |
| **C — 실행 큐→PLN** | 승격·Handoff | 시드 유지 |
| **D — M4 transport** | `/g1cos` lineage 읽기 | 시드 유지; **확장 no-go** |
| **E — M5** | dedup·멀티 인스턴스 | **M5a 시드:** `SLACK_EVENT_DEDUP_FILE` / disable (`eventDedup.js`); 완전 하드닝은 후속 |

## 구현 메모 (B 폐루프)

1. `appendAgentWorkQueueProofByLinkedRun` — `linked_run_id` 일치 시.
2. **`appendAgentWorkQueueProofByLinkedWork`** — WRK만 연결된 활성 AWQ에 `cursor_result:…` 증거( run 미부착·폴백).

## 다음 (비 MVP)

0. ~~대표 표면 `피드백:` → 워크스페이스 `customer_feedback` 큐~~ (제품 주인 MVP ③ 피드백 슬랙 인입).
0b. ~~CFB 롤업·M4 lineage·자연어 피드백 확장~~ — `executiveStatusRollup`(피드백 큐 줄)·`실행 큐/고객 피드백 목록`·`CWS-`/`CFB-` 드릴다운·`제품/사용자 피드백 저장` 자연어·dialog 한 줄 인입 안내.
0c. ~~CFB → AWQ 초안 자동~~ — `customerFeedbackAwqBridge.js` · `evaluateApprovalPolicy(customer_feedback_intake)`(prod·고위험 프로필 → `pending_executive`) · `linked_awq_id`.
0d. **`COS_FAST_SPEC_PROMOTE=1`** — `start_project` 표면에서 실행 큐 적재 직후 **PLN·WRK**까지 한 응답(로컬·데모; prod 기본 끔). `scripts/test-start-project-fast-promote.mjs`.
0e. **`COS_AGENT_BRIDGE_URL`** — `커서발행`·`이슈발행`·`수파베이스발행` 성공 직후 **외부 워커**로 `tool_dispatch` JSON (`agentBridgeOutbound.js`). 회수는 기존 **`POST /cos/ci-proof`**. `COS_Agent_Bridge_Outbound_v0.md`.
1. ~~구조화 `커서결과기록` 스모크~~ → `scripts/test-cursor-result-structured-smoke.mjs` (`npm test`).
2. ~~M5a dedup 공유 파일 옵트인~~ → `scripts/test-event-dedup.mjs`; Redis 등 강한 락은 후속.
3. ~~부팅 dedup 모드 표시 · 공유파일 원자적 쓰기~~ → `getSlackEventDedupSummary` / `formatEnvCheck`, `eventDedup` tmp+rename(+copy 폴백).

## Owner actions

```bash
cd /path/to/g1-cos-slack && npm test
```

SQL: 없음.
