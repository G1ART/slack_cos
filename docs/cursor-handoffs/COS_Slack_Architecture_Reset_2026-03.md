# COS × Slack — 아키텍처 리셋 제안 (2026-03)

**Authority role:** Product-layer interpretation

**Can define:**

- how to read the repo as a product/system

**Cannot override:**

- Directive
- Alignment build order

**Use when:**

- architecture interpretation conflicts arise

---

> **문서 권위**: `COS_Project_Directive_NorthStar_FastTrack_v1.md` **§1c** — 본 문서는 **디렉티브 다음 순위**의 **제품·아키텍처 층 해석**이다. 읽기 순서 한 장: **`00_Document_Authority_Read_Path.md`**. (외부 Alignment Memo 초안의 `Slack_COS_Architecture_Reset_Handoff_2026-03-22` 와 동일 역할; 레포 파일명은 본 문서.)

## 0. North Star Fast-Track v1 (2026) — 정렬

**GOAL-IN / DECISION-OUT**: 대표 표면은 **작게**(5류 + 자연어), planner/work/run 등은 **내부 API로 유지·감춤**. Slash·버튼 확장은 **decision packet·승인·회귀 이후**. 상위 디렉티브: `COS_Project_Directive_NorthStar_FastTrack_v1.md` · 표면·라우팅: `COS_FastTrack_v1_Surface_And_Routing.md` · North Star 요약: `COS_NorthStar_Workflow_2026-03.md`.

---

## 1. 궁극적 root cause (기술 + 제품)

### A. **자유 텍스트 + 거대 if 체인 + LLM 폴백**

- Slack **멘션/일반 메시지** 한 줄에 “의도 + 인자 + 서식”이 전부 들어온다.
- 파서는 `startsWith`, 정규식, 멀티라인 첫 줄만 장식 제거 등 **휴리스틱 누적**이며, 한 조건이 어긋나면 **맨 아래 Council(다중 LLM)** 으로 떨어지는 구조였다.
- **조회 명령이 Council로 간 진짜 버그 예**: `normalizeSlackCommandDecorations`가 **첫 줄만** `*` 제거 → 둘째 줄의 `계획상세 PLN-…` 은 전체 문자열 기준 `startsWith('계획상세')` 가 **영원히 false** → query 라우터 미스 → Council.

### B. **입력 채널이 “명령”이 아니라 “채팅”**

- CLI/슬래시 커맨드는 **문법이 OS에 고정**돼 있다.
- Slack rich text는 **노드 분할·줄바꿈·멘션**으로 동일 사용자 의도가 **여러 바이트 표현**이 된다. 이걸 문자열만으로 맞추는 것은 **본질적으로 비용이 큼**.

### C. **토큰·단계 병목 (사용자 지적과 정합)**

- “매 스텝 승인/세부지시”는 **상태머신·UI 버튼**으로 흡수해야 하고, **매번 장문 LLM**으로 흡수하면 토큰·지연·품질 분산이 커진다.

---

## 2. 잘 되는 툴 벤치마크 (요지)

| 패턴 | 예시 | 우리가 가져올 점 |
|------|------|------------------|
| **고정 진입 구문** | Slack `/command`, Discord `/`, Linear `/` | payload가 **구조화**됨 → 파싱 비용 ≈ 0 |
| **버튼·드롭다운** | Jira, PagerDuty, Slack shortcuts | 다음 액션은 **callback_id** 한 방 |
| **링크 딥링크** | GitHub `?tab=`, Notion URL | “이 객체”가 URL로 고정 |
| **별도 API + 얇은 봇** | Zapier, n8n | 봇은 **라우팅만**, 비즈니스 로직은 서비스 레이어 |

---

## 3. 권장 방향 (backbone / 토대)

### Phase 0 — 지금 코드 (유지보수)

- **구조화 명령**: 멀티라인·줄 단위 조회 추출(`extractQueryCommandLine`) 등 **폴백을 줄이는 방어**.
- 로그: `routing_sync.planner_lock`, `query_prefix` 로 현장 분류.

### Phase 1 — **슬래시 커맨드 + 인자 스키마** (강추)

- **부분 완료 (2026-03-24)**: `/g1cos <조회 한 줄>` — 기존 조회 5종, `tryFinalizeSlackQueryRoute` 공유 (`registerSlashCommands.js`).
- 향후 예: `/g1cos plan detail PLN-xxx` 서브커맨드, `/g1cos work WRK-xxx` 등 **JSON 스키마 검증** 확장.
- Bolt `slackApp.command(...)` → **Council 경로 미탑재** (조회 구간).
- 자유 텍스트 @멘션은 **“자연어 모드”**로 유지.

### Phase 2 — **Home tab / 메시지 버튼**

- **부분 (2026-03-24)**: 조회 본문 **Block Kit `section`·`mrkdwn`** (`queryResponseBlocks.js`) — 단락 가독성.
- 남음: `계획상세`, `계획발행목록` 등 **action_id 고정 버튼** → payload에 `plan_id` → 서버 **토큰 한 줄** 처리.

### Phase 3 — **도메인 서비스 레이어**

- `PlanService.getDetail(id)`, `WorkService.getDetail(id)` — Slack은 **전달 계층**만.
- “봇 파일 3000줄”을 **라우터 200줄 + 서비스**로 쪼갬.

### Phase 4 — **Council 정책**

- 기본 폴백을 Council에서 **명시적 `/council` 또는 버튼**으로만 열기 (정책 결정 필요).

---

## 4. “싹 밀고 다시” 판단 기준

- **다시 쌓을 가치**가 있음: Phase 1~3을 택할 때 **새 레포지토리**로 `slack-gateway`(라우팅만) + `g1cos-core`(도메인) 분리.
- **기존 코드 위에 계속 얹기**가 나음: 당장은 **slash + extractQueryCommandLine** 만으로도 체감 실패율이 크게 줄어듦.

---

## 5. 이번 코드 패치 (멀티라인 조회)

- `extractQueryCommandLine` + `handleQueryOnlyCommands(queryLineResolved)` — 위 root cause A의 **첫 줄만 정규화** 문제 완화.

---

## 6. 사용자에게 확인할 운영 질문 3개

1. 채널에서 **항상 @멘션** 인가, 아니면 **슬래시 도입** 가능한가?
2. Council은 **기본 응답**으로 유지할지, **옵트인**으로 바꿀지?
3. “한 메시지에 인용/여러 줄” 패턴을 **허용**할지, **슬래시만 허용**할지?

답에 맞춰 다음 스프린트 범위를 줄이는 것이 좋다.

---

## 7. 제품 방향 정본 (아키텍처와의 관계)

기술 페이즈(본 문서) 위에 **“왜 이렇게 쪼개는가”** 는 `COS_Project_Directive_NorthStar_FastTrack_v1.md` + `COS_NorthStar_Workflow_2026-03.md` — 디렉티브·**제품 원칙 (북스타트)** (지휘자·COS 허브·게이트·의도 정확도·피드백 루프).
