# cursor-handoffs — Big Pivot / COS 구현·라우팅 노트

**Big Pivot**: 이 레포 Slack COS 런타임(봇)을 부르는 이름.  
이 폴더는 **Cursor · ChatGPT · 사람**이 작업 맥락을 이어 받는 **핸드오프·구현 노트** 모음이다. **문서 권위(헌법·빌드 순서·런타임)는 `00_Document_Authority_Read_Path.md` 가 고정한다.**

## 작업 후 관습

- 동작·라우팅이 바뀌면 **`COS_Inbound_Routing_Current_*.md`** 와 필요 시 **`G1_ART_Slack_COS_Handoff_v2`**(구현 ledger) 해당 §를 같이 고친다.
- 프로젝트 규칙: `.cursor/rules/handoff-docs-update.mdc`

## 빠른 링크

| 문서 | 용도 |
|------|------|
| `00_Document_Authority_Read_Path.md` | **필독** — 읽기 순서·권위 맵 (North Star 신규 메모 아님) |
| `COS_Inbound_Routing_Current_260323.md` | 인바운드 **pre-AI**(`runInboundCommandRouter`)·**AI 꼬리**(`runInboundAiRouter`)·버퍼·파일 목록 |
| `COS_Project_Directive_NorthStar_FastTrack_v1.md` | **프로젝트 디렉티브 정본** — §1c 권위 순서·§4 M1–M5·§1b 비전·스키마 최소 |
| `COS_NorthStar_Alignment_Memo_2026-03-24.md` | **구현 순서 잠금** — M2a+M2b 복합·no-go·UX 계약·보고 §16 (영문+§19 비판) |
| `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` | **하네스·Anthropic 교훈 번역**·M2 필드/성공 조건·M5a/b·M6·no-go·보고 13항 (동반 정본) |
| `COS_OpenClaw_Vision_Roadmap_2026-03.md` | 코드 갭·자산 맵 (빌드 순서는 Alignment Memo 우선) |
| `COS_MVP_Definition_Owner_2026-03-27.md` | **제품 주인 MVP 4항** — 락인·traceable 구현·배포·피드백·다목적 확장 루프 (빌드 순서는 Alignment 정본) |
| `COS_NorthStar_Workflow_2026-03.md` | North Star · **Fast-Track v1** — GOAL-IN/DECISION-OUT·북스타트·패치 순서 |
| `COS_FastTrack_v1_Surface_And_Routing.md` | **대표 5류 vs 내부 API**·라우팅 순서 계약·Council·proof·안티 목표 |
| `Regression_Harness_slack_fixtures.md` | `npm test` fixture 회귀 |
| `WRK-260324-02_slash_g1cos_query_mvp.md` | `/g1cos` 슬래시 조회 MVP · Slack 앱 등록 절차 |
| `WRK-260324-03_query_response_block_kit.md` | 조회 응답 Block Kit 단락 · `SLACK_QUERY_BLOCKS` |
| `WRK-260324-04_query_nav_buttons.md` | 조회 하단 PLN/WRK 네비 버튼 · `g1cos_query_nav_*` · `SLACK_QUERY_NAV_BUTTONS` |
| `WRK-260325-01_planner_hard_lock_module.md` | `runPlannerHardLockedBranch.js` + `src/util/formatError.js` |
| `WRK-260325-02_north_star_product_principles.md` | North Star 제품 원칙·업계 정렬 참고·다음 패치 정리 |
| `WRK-260325-03_tool_registry_runtime_v1.md` | 툴 레지스트리 v1 — pipeline/gate·`tool_registry_bind`·구조화 로그 |
| `WRK-260325-04_conversation_buffer_json_persist.md` | 대화 버퍼 로컬 JSON 영속(옵트인)·`CONVERSATION_BUFFER_*` |
| `WRK-260326-01_workspace_queue_intake.md` | 최단거리: `실행큐:`·`고객피드백:` → `cos-workspace-queue.json` |
| `WRK-260327_fast_track_phase1.md` | Fast-Track Phase 1: 도움말 분리·surface intent·상태 스텁 |
| `WRK-260327_shortest_path_post_command_media.md` | 문서 권위 정리 이후 **최단거리** 실행 순서(M3 폐루프·M4·M5) |
| `COS_Operator_QA_Guide_And_Test_Matrix.md` | 운영·QA — 수동 테스트 (제품 헌법 아님) |
