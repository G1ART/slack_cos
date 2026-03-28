# COS Operator QA Guide and Test Matrix (internal)

**Authority role:** Operator / QA guide

**Can define:**

- manual test procedures
- operator-safe commands
- regression checks

**Cannot override:**

- Directive
- Alignment
- Runtime truth
- executive product shape

**Use when:**

- manual validation
- QA
- operator workflows

---

> **범위:** 이 파일은 **운영·QA·수동 회귀**용이다. **대표/경영 표면의 제품 정의나 헌법이 아니다.** 제품 진리·순서·런타임은 `00_Document_Authority_Read_Path.md` 순서를 따른다.  
> **North Star Fast-Track**: **GOAL-IN / DECISION-OUT** — 대표는 **목표·결정**으로 말하고, 엔진 문법을 외울 필요가 없다. **`도움말`** = 대표 표면(5류)만, **`운영도움말`** = 내부 실행 어휘 전체.  
> **COS**는 고지능·고감성·균형 잡힌 비서실장; **Council·장문 다각 논의는 옵트인** (`협의모드:`). **완료 주장은 증거(proof) 없이 하지 않음** (로드맵에서 패킷·런 ID·PR 등 연동).  
> **CEO 좌절 모델**(문법 강요·분석으로 멈춤·내부 덤프·과잉 승인·증거 없는 완료)을 패치마다 줄이는지 검토 — 상세: `COS_Project_Directive_NorthStar_FastTrack_v1.md`.  
> 구현 순서·no-go: `COS_NorthStar_Alignment_Memo_2026-03-24.md`.  
> 정본: `COS_Project_Directive_NorthStar_FastTrack_v1.md` · `COS_FastTrack_v1_Surface_And_Routing.md` · `COS_NorthStar_Workflow_2026-03.md`.

---

## 1. 진입점이 어떻게 바뀌었는가

### 1.1 지금 동작 중인 진입 (코드 기준, 2026-03)

| 진입 | 조건 | 비고 |
|------|------|------|
| **채널 @멘션** | `@COS봇` + 메시지 | `app_mention` → `getInboundCommandText` → `handleUserText` → `runInboundCommandRouter` (+ 미스 시 `runInboundAiRouter`) |
| **슬래시 `/g1cos`** | 채널에서 `/g1cos …` | Bolt `command` → **M4 lineage** (`턴`·`패킷`·`워크큐 AWQ-…`·**`워크큐 목록`/`대기`**) 후 **조회 한 줄**. Council·LLM 없음. **Slash Command `/g1cos`** 등록 필요 |
| **DM** | 봇과 1:1 채팅 (subtype 없는 일반 메시지) | `message` + `channel_type === im` 만 처리 |
| **채널 일반 메시지 (멘션 없음)** | — | **이 앱은 이벤트를 받지 않음** (Slack 구독 설계상) — 예외: **`/g1cos`** 만 슬래시로 진입 |
| **`도움말`** | 멘션/DM 정확히 이 한 단어 | **대표 표면** 안내만 (5류 — 명령 미로 없음) |
| **`운영도움말`** | 멘션/DM | **운영·에이전트·디버그**용 전체 문자열 목록 |
| **Surface 예시** | `프로젝트시작: …`, `지금 상태 보여줘`, `이건 보류`, `배포 준비` | 구조화·조회와 충돌 없을 때 **즉시 짧은 패킷/스텁** (저장소 연동은 로드맵) |

**개선으로 바뀐 점 (사용 체감)**

1. **문자열 정규화 단일 파이프라인**  
   인바운드 병합 후에도 `normalizeSlackUserPayload` 한 경로만 탐 → `text` vs `blocks` 때문에 라우팅이 갈라지던 문제 완화.

2. **조회 명령 멀티라인**  
   예: 첫 줄은 맥락, 둘째 줄에 `계획상세 PLN-…`  
   → 예전에는 전체가 `계획상세`로 **시작하지 않아** Council로 새었음 → **줄 단위로 조회 줄을 찾아** 처리.

3. **라우팅 스냅샷 로그**  
   `routing_sync_snapshot` / `router_entered` 의 `routing_sync` 에 `planner_lock`, `query_prefix` 가 찍힘 → “왜 Council 갔는지” 추적 가능.

### 1.2 아직 없음 (로드맵 — 제안대로 “다시 쌓을” 때)

| 진입 | 설명 |
|------|------|
| **에이전트 툴 호출** | **v1**: 레지스트리 `pipeline`/`gate_policy` + 로그 `tool_registry_bind`·구조화 `tool_registry_gate` (차단 없음). **v2**: LLM function calling·실차단 게이트 (예정) |
| **`/g1cos …` 슬래시** | Bolt `command` — **조회 한 줄** + **M4 lineage**(턴·패킷·워크큐·목록/대기); 플래너·뮤테이션·내비 **멘션/DM** |
| **Block Kit (조회 본문)** | `tryFinalizeSlackQueryRoute` 응답이 **section·mrkdwn** 단락으로 전송 (멘션·DM·`/g1cos`). `SLACK_QUERY_BLOCKS=0` 이면 평문만 |
| **조회 네비 버튼** | PLN/WRK 조회 성공 시 **같은 ID**의 다른 조회로 이어지는 **actions** 버튼 (`g1cos_query_nav_*`). 클릭 시 스레드에 동일 조회 파이프라인 응답. `SLACK_QUERY_NAV_BUTTONS=0` 으로 끔 |
| **대화 기억 영속화** | 기본은 메모리만. **옵트인**: `CONVERSATION_BUFFER_PERSIST=1` 이면 로컬 JSON(`data/slack-conversation-buffer.json` 또는 `CONVERSATION_BUFFER_FILE`)에 스냅샷 — 단일 인스턴스·재시작 복구. **멀티 인스턴스 공유**는 Supabase 등 로드맵 |
| **워크스페이스 큐 (최단거리)** | 멘션/DM에서 `실행큐: …` 또는 **자연어**(`실행큐에 올려줘` + 다음 줄 등) / `고객피드백:` 등 → `data/cos-workspace-queue.json`. **COS 대화(dialog)** 응답이 충분히 길면 하단에 *실행 큐 / 고객 피드백 / 안 올림* 버튼이 붙을 수 있음 (`SLACK_DIALOG_QUEUE_BUTTONS=0` 으로 끔). 목록 명령으로 조회. 자동 구현은 없음 |

---

## 2. 사용자는 어떻게 하면 되는가

### 2.1 역할 나누기 (권장 습관)

| 하고 싶은 것 | 권장 입력 | 이유 |
|-------------|-----------|------|
| **명령어 없이 방향부터 잡기** | `COS …` 또는 `비서 …` + 상황·목표 | **내비게이터**가 이해 정리·질문·다음 단계를 안내 (Council보다 가벼움). 응답 끝(또는 `COS`만 쳤을 때 intro)에 **`계획등록:` 복붙 초안** 코드 블록이 붙음 — 수정 후내면 플래너 진입 |
| **토론·브레인스토밍·리스크·결정** | 멘션/DM으로 **평문** 또는 `협의모드: …` | **평문** → `dialog`(자연어 COS); **다각 합성**이 필요하면 `협의모드:` |
| **계획/업무 “조회” (QC·상태 확인)** | **한 줄에** `계획상세 PLN-…`, `계획발행목록 PLN-…`, `업무상세 WRK-…` 등 | 구조화 라우터로 직행, 토큰·지연 최소 |
| **계획 등록 직후 같은 스레드에서 이어 말하기** | `계획등록:` 없이 평문만내도 됨 (자연어 `dialog`) | 스레드 버퍼에 직전 플래너 응답이 있으면, 답변 끝에 `계획상세 PLN-…` 안내가 **짧게** 붙을 수 있음 |
| **계획 등록** | `계획등록: …` 또는 `계획등록 …` (본문 필수) | Planner 전용, Council 비사용 |
| **멀티라인** | 조회/등록 줄은 **가능하면 단독 줄**로 (앞줄 맥락 + 다음 줄 명령도 이제 지원) | 예전 버그 완화됐으나, **한 줄이 가장 확실** |
| **결정 큐(AWQ) → 발행(run)** | `워크큐*` 후 `커서발행` / `이슈발행` / `수파베이스발행` (동일 WRK) | 성공 응답에 **활성 워크큐에 `linked_run_id` 반영** 안내(중복 run이면 `dispatch_run:` 증거). 상세는 `운영도움말` |
| **AWQ 증거만 기록** | `워크큐증거 <AWQ-…> <한 줄>` · `러너증거 <run_id> <한 줄>` | `proof_refs`에만 append(상태 변경 없음). CI: `COS_CI_HOOK_*` 시 **`GET /cos/health`**(가용성)·**`POST /cos/ci-proof`** JSON — 예시 `docs/cursor-handoffs/COS_CI_Proof_Hook_Example_GitHubActions.yml` |

### 2.2 피하면 좋은 것

- 조회 명령을 **굵게만 씌우고** 닫는 `*` 없이 보내기 → 첫 줄 정규화에 맡기되, **plain 한 줄**이 가장 안전.
- **멘션 없이** 채널에만 쓰기 → 봇이 안 받을 수 있음.

### 2.3 디버그/배포 확인 시 (운영자)

- 로그에서 `routing_sync_snapshot` 검색:  
  - 조회인데 `query_prefix: null` 이면 **문자열이 조회 패턴으로 인식 안 된 것**  
  - `planner_lock: "hit"|"miss"` 인데 Council·dialog로 새면 **버그 후보** (플래너 분기 우선이어야 함)

---

## 3. 영역별 테스트 — 무엇을 어떻게 보면 되는가

### 3.1 자동 (로컬)

```bash
cd /path/to/g1-cos-slack
npm test
# 또는 라우터+fixture 만
npm run test:router
# 또는 Slack payload fixture 만
npm run test:fixtures
```

- `test-operations-loop.mjs`: planner / 조회 멀티라인 추출 / 인바운드 샘플 등  
- `test-router-lockdown.mjs`: planner·query·Council 시그니처 차단 등  
- `replay-slack-fixtures.mjs`: **Slack event fixture** 기준 동기 스냅샷 + query/planner/**navigator**/council/**dialog** 1차 분류 + Council 누수 규칙 (상세: `Regression_Harness_slack_fixtures.md`)

### 3.2 수동 — 영역 매트릭스

| 영역 | 무엇을 검증 | 채널/DM | 예시 입력 | 기대 |
|------|-------------|---------|-----------|------|
| **A. 진입** | 멘션/DM만 응답 | 채널 | 멘션 없이 일반 텍스트 | 무응답 가능 (설계상) |
| **B. 조회 (한 줄)** | Council 장문 없음 | DM 권장 | `계획상세 PLN-…` | `[계획상세]` 블록만 |
| **C. 조회 (멀티라인)** | 둘째 줄 조회 | DM | `확인 부탁\n계획상세 PLN-…` | 동일하게 조회만 |
| **D. 조회 (없는 ID)** | not_found, Council 없음 | DM | `업무상세 WRK-NONE` | 짧은 not_found |
| **E. Planner** | contract 또는 빈 본문 안내 | DM | `계획등록: …` / `계획등록:` | PLN/WRK 또는 본문 비움 안내, Council 없음 |
| **F. 평문 대화** | Council 비진입·짧은 대화형 | DM | `이번 주 우선순위만 정리해줘` | 일반 문단 응답 (dialog), Council 헤더 없음 |
| **F2. Council** | 협의 장문 | DM | `협의모드: …` | `한 줄 요약` 등 Council 포맷 |
| **G. 승인 버튼** | 인터랙션 | 스레드 | 승인/보류 버튼 | 메시지 전송, `handleUserText` 비경로 |
| **H. 저장소** | Supabase/JSON | — | `상태점검` / `저장소점검` 등 | 환경에 맞는 요약 |
| **I. 결정 패킷 (M2b+M3 시드)** | 표면 + 같은 스레드 짧은 회신 | 스레드 권장 | `결정비교: …` 후 `1안` 또는 `더 빠른 쪽` | 첫 턴: 패킷; 둘째 턴: `work_queue_id`(`AWQ-*`)·trace·`data/agent-work-queue.json` |

### 3.3 회귀 체크리스트 (배포 직후 5분)

- [ ] DM: `도움말`
- [ ] DM: `계획상세 <실제 또는 가짜 PLN>`
- [ ] DM: `앞줄\n계획상세 <PLN>` (멀티라인)
- [ ] DM: `계획등록: 테스트 한 줄`
- [ ] 채널: `@봇 계획진행 <PLN>`
- [ ] DM: 평문 한 줄 — **dialog** 응답, Council 포맷 아님
- [ ] DM: `COS …` — **내비게이터** 구조화 응답
- [ ] DM: `협의모드: …` — Council 전용 장문
- [ ] (선택) 채널 스레드에서 동일 스레드로 두 턴 연속 평문 — 두 번째 답이 첫 턴을 **맥락으로 참조**하는지 (`thread_ts`·버퍼)
- [ ] (선택) 스레드: `결정비교: …` → 같은 스레드에 `1안` — 회신에 `work_queue_id`·로컬 `agent-work-queue.json` 항목 확인
- [ ] (선택) `/g1cos 패킷 PKT-…` 또는 멘션 한 줄 동일 — 감사에 있으면 패킷 스냅샷, 없으면 미스 안내
- [ ] (선택) trace JSONL에 있는 `turn_id`로 `/g1cos 턴 <uuid>` — 요약 필드 확인

---

## 4. 방향성이 “틀리지 않은” 이유 (한 줄)

- **자연어 층**: 사람–COS 대화·결정·논의.  
- **명령어 층**: 에이전트 실행·상태·QC·문서에 **고정 문법**으로 붙이면 유지보수·토큰·신뢰도가 같이 올라감.  
- 다음 최적화는 **슬래시/버튼으로 명령 층을 더 얇게** 만드는 것.

---

## 5. 문서 위치

- **권위 읽기 순서 (필독)**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`
- **인바운드 라우팅 정본 (Big Pivot / dialog / 명시 Council)**: `docs/cursor-handoffs/COS_Inbound_Routing_Current_260323.md`  
- **핸드오프 폴더 안내**: `docs/cursor-handoffs/README_HANDOFFS.md`  
- North Star·4단계: `docs/cursor-handoffs/COS_NorthStar_Workflow_2026-03.md`  
- 아키텍처 로드맵: `docs/cursor-handoffs/COS_Slack_Architecture_Reset_2026-03.md`  
- 내비게이터: `docs/cursor-handoffs/COS_Navigator_260323.md`  
- 회귀 하네스: `docs/cursor-handoffs/Regression_Harness_slack_fixtures.md`  
- 라우터 락다운(히스토리 + finalize 규칙): `docs/cursor-handoffs/Router_Lockdown_260318_handoff.md`  
- **본 가이드 (운영·QA)**: `docs/cursor-handoffs/COS_Operator_QA_Guide_And_Test_Matrix.md`

슬래시 커맨드가 **코드에 추가되는 시점**에는 이 파일 §1.2 → §1.1 로 옮기고, Slash Command 생성 절차(Slack API 설정)를 §2에 추가하면 된다.
