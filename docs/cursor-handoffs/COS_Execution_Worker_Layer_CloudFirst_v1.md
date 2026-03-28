# COS 실행 레이어 — Cloud-First 재정의 v1

**Authority role:** 실행 아키텍처(오케스트레이션 경계) 메모 — **제품 헌법·빌드 순서·런타임 분기 정본이 아님**

**Can define:** worker를 어디에 두고 COS가 무엇까지 맡길지, 대표 vs 엔지니어링 액션 목록

**Cannot override:** `COS_Project_Directive_NorthStar_FastTrack_v1.md`, `COS_NorthStar_Alignment_Memo_2026-03-24.md`, `COS_Inbound_Routing_Current_*.md`

**Use when:** “슬랙 COS → 코딩 자동화”를 **로컬 Cursor 앱이 아니라 클라우드/연동**으로 설계할 때

**외부 제품 사실:** Cursor의 **Slack·GitHub·Cloud Agents·Automations·API** 명칭·플랜·엔드포인트는 수시로 바뀐다. 실행 전 **Cursor 공식 문서·대시보드**로 항상 재확인한다.

---

## 1. 전제 교정 (한 번만 못 박기)

| 잘못 잡은 그림 | 맞는 그림 |
|----------------|-----------|
| Slack COS → **내 노트북 Cursor IDE**가 웹훅으로 깨어나 로컬 에이전트 실행 | Slack COS → **클라우드·연동 계층**(Cursor Cloud Agent / Automations / API, GitHub 트리거 등)이 worker → 결과·증거가 **Slack/GitHub/CI**로 복귀 |
| `커서발행` 핸드오프 **파일 읽기**가 최종 목표 | 핸드오프 파일은 **과도기·폴백**; 최종 루프는 **traceable dispatch + proof + 배포/피드백** |

이 레포의 `COS_AGENT_BRIDGE_*`는 **“L2 릴레이로 JSON을 넘길 우편함 URL”**이지, **로컬 IDE 직결**이 아니다.

---

## 2. 목표 레이어 (빠르게 공유하는 그림)

```
[L0] Slack / 사람  ──자연어·승인──►  [L1] COS 런타임 (본 레포)
                                      │  PLN/WRK/AWQ·감사·구조화 명령
                                      ▼
[L2] 통합 릴레이 (얇은 서비스 또는 Make/n8n/팀 자체 워커)
     ◄── POST tool_dispatch (COS_AGENT_BRIDGE_URL, 선택 시크릿)
                                      │
                                      ▼
[L3] Worker (택1 이상)
     · Cursor Cloud Agents / Automations / API (Cursor 대시보드·문서 기준)
     · GitHub: PR·issue 댓글 트리거 (Cursor 또는 타 러너)
     · 기존 CI / Supabase 파이프라인
                                      │
                                      ▼
[L4] Proof & feedback
     · PR·Actions 로그·스테이징 URL
     · POST /cos/ci-proof (COS_CI_HOOK_*) 로 AWQ proof_refs
     · 슬랙 스레드 회신 (기존 COS 인바운드)
```

**대표님이 “원하는 자동화”가 성립하는 지점:** L1이 **승인·범위·추적 ID**를 고정한 뒤 L2→L3가 **동일 ID·동일 브리프**로 실행하고 L4로 **닫히는 것**.

---

## 3. 본 레포에 이미 있는 것 (재사용)

| 자산 | 역할 |
|------|------|
| `runInboundStructuredCommands` | `커서발행`·`이슈발행`·`수파베이스발행`·AWQ 연결 |
| `agentBridgeOutbound.js` | 성공 시 **L2로 `tool_dispatch` JSON POST** (URL 없으면 무동작) |
| `ciWebhookServer.js` | **L4 인바운드** 증거 한 줄 (`COS_CI_HOOK_*`) |
| lineage·패킷·CFB→AWQ | front door·감사·피드백 루프 축 |

**아직 없는 것:** L2 릴레이가 **Cursor Cloud API / Automations 스키마**에 맞게 변환해 주는 코드(또는 상용 커넥터). 이건 **Cursor 측 스펙·키**에 종속되므로 레포 밖 또는 별 모듈로 두는 게 보통이다.

---

## 4. 대표(Owner)가 할 일 — 체크리스트

순서대로 가능한 것부터.

1. **Cursor 쪽 계정·기능 확인**  
   팀/플랜에서 **Cloud Agents**, **Slack 연동**, (선택) **GitHub 연동**, **Automations/API** 를 쓸 수 있는지 **공식 문서·설정 화면**으로 확인한다. (이름·메뉴는 바뀔 수 있음.)

2. **Worker 전략 하나를 고른다** (초기에는 하나만)  
   - **A.** Cursor Cloud(+Slack)가 주 worker  
   - **B.** GitHub 이벤트(issue/PR 코멘트)가 주 트리거  
   - **C.** A+B (나중에)

3. **슬랙 레일 정책**  
   COS 봇 채널과 Cursor 봇 채널을 **같이 쓸지 / 나눌지** 정한다. (이슈·소음·권한 분리.)

4. **`.env` (COS 서버)**  
   - `COS_AGENT_BRIDGE_URL`: L2가 받을 **실제 HTTPS 주소**가 생기면 그때 붙인다. 없으면 **비운다**.  
   - `COS_AGENT_BRIDGE_SECRET`: L2와 **같은 문자열**로 맞출 비밀값(직접 정하거나 릴레이가 생성).  
   - `COS_CI_HOOK_PORT` / `COS_CI_HOOK_SECRET`: worker·CI가 증거를 넣을 계획이 있으면 설정.

5. **“언제 자동으로 쏜다”만 기억**  
   지금 코드 기준 **자동 POST는** `커서발행`·`이슈발행`·`수파베이스발행` **성공 직후**이다. 승인·게이트는 기존 COS/plan 규칙을 그대로 탄다.

6. **기대치**  
   L2·L3 없이 URL만 비우면 **이전과 같이** 슬랙·파일 핸드오프 중심으로 동작한다. **자동 worker는 L2/L3 세팅 후**에나 완성된다.

---

## 5. 엔지니어링·운영이 할 일 (최소 한 사이클)

1. **L2 릴레이** (작은 HTTP 서비스 또는 자동화 플랫폼)  
   - 입력: COS가 보내는 `tool_dispatch` JSON + `X-COS-Agent-Bridge-Secret`  
   - 출력: 선택한 worker에 맞는 호출  
     - 예: Cursor **공식 API**로 cloud agent launch (페이로드 필드는 문서대로 매핑)  
     - 예: GitHub API로 issue 코멘트 `@cursor …` (정책 허용 시에만)  
   - 실패 시 슬랙/로그 알림, **work_id / run_id**로 추적

2. **시크릿 관리**  
   COS `COS_AGENT_BRIDGE_SECRET`, 릴레이, Cursor/GitHub 토큰은 **같은 팀의 비밀 저장소**에만 둔다.

3. **L4 닫기**  
   - `POST /cos/ci-proof` 또는 슬랙 `커서결과기록` 등으로 **proof가 COS 객체에 남는지** 연결 테스트

4. **핸드오프 파일 위치**  
   브리지가 동작하면 핸드오프는 **백업·사람 개입용**으로 격하; primary는 **cloud run + GitHub diff**.

---

## 6. 개발 없이 “빠른 실험”만 할 때

1. Make / n8n 등에서 **Webhook 트리거**로 URL 발급 → `COS_AGENT_BRIDGE_URL`에 설정.  
2. 다음 단계로 **같은 채널에 슬랙 메시지**만 보내기: `work_id`, `run_id`, `handoff_path` 요약.  
3. 대표님 또는 운영자가 **Cursor Cloud / Slack @cursor** 를 그 스레드 기준으로 수동 실행.  

이건 **완전 자동은 아니지만**, COS→외부 알림 파이프는 **바로 검증** 가능하다.

---

## 7. 이 문서와 다른 정본의 관계

- **인바운드 분기·명령 동작**가 궁하면 → `COS_Inbound_Routing_Current_*.md`  
- **무엇을 언제 빌드할지**가 궁하면 → Alignment Memo  
- **아웃바운드 POST 필드 상세** → `COS_Agent_Bridge_Outbound_v0.md`

---

## Owner actions (복붙)

```bash
# COS 서버에서: 브리지가 없으면 이 줄들은 비우거나 주석 처리
# COS_AGENT_BRIDGE_URL=
# COS_AGENT_BRIDGE_SECRET=

# 증거 피드백 루프(선택)
# COS_CI_HOOK_PORT=3939
# COS_CI_HOOK_SECRET=

cd /path/to/g1-cos-slack && npm test
```

SQL: 없음.
