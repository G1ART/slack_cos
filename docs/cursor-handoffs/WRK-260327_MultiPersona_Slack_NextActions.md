# WRK — Slack multi-persona 워크스페이스: 지금부터 할 일 (2026-03-27)

**Authority:** 실행 순서 브리프 — Directive·Alignment·Inbound Routing 정본 **아님**  
**목표:** 대표님이 **슬랙에서 COS로 제품 정의 → 견제·협력(다각) → 실행·증거**를 **가장 빨리 체감**하는 경로.

---

## 현재 코드에 이미 있는 것 (착각 금지)

| 기대 | 코드 상태 |
|------|-----------|
| 대표 ↔ COS 자연어·표면(`툴제작:`, `피드백:`, `지금 상태`) | ✅ Fast-Track surface, dialog |
| 실행 큐 → PLN·WRK | ✅ `실행큐계획화`, (옵션) `COS_FAST_SPEC_PROMOTE` |
| **명시적 multi-persona 다각** | ✅ **`협의모드:`** → Council — **옵트인**, LLM 비용 있음 |
| 워크큐·CFB·AWQ·감사 | ✅ M2/M3/M4 축 |
| 외부 코딩 worker로 쏘기 | ✅ `COS_AGENT_BRIDGE_URL` (L2가 Cursor Cloud API 등으로 이어야 **완주**) |
| **완전 무인 배포** | ❌ 제품·인프라 미완 — 증거·승인·호스팅은 단계적 |

---

## A. 오늘~이번 주: 슬랙에서 “COS와 제품 정의”만 먼저 굳히기 (코딩 불필요)

COS 봇이 있는 채널/DM에서 **순서대로** 시도 (실채널 권장).

1. **목표 한 줄** — `툴제작: …` 또는 `프로젝트시작: …`
2. **실행 큐 → 계획·업무** — 응답의 `실행큐계획화 CWS-…` / `실행큐계획화 최근` 입력  
   (로컬에 `COS_FAST_SPEC_PROMOTE=1`이면 PLN·WRK까지 한 번에 나올 수 있음.)
3. **상태** — `지금 상태` 또는 `현재 상태`
4. **결정** — `결정비교: …`
5. **피드백** — `피드백: …` (CFB·AWQ 초안)

→ **제품 정의 + trace 객체**가 슬랙·JSON에 쌓이는지 먼저 확인.

---

## B. multi-persona 견제·협력을 슬랙에서 바로 보기

**한 줄로 Council 진입** (평문은 dialog, 다각은 **`협의모드:`** 명시.)

```
협의모드: (주제) — 전략·제품·엔지니어링 관점에서 옵션 2~3개와 리스크를 비교해 줘.
```

- 중요한 결정만 — 비용·지연 있음.

---

## C. 자동 구현·배포에 가깝게: 최소 연결

1. **L2** — `COS_AGENT_BRIDGE_URL` (Make/n8n 또는 얇은 HTTP 수신)
2. **L3** — Cursor Cloud Agents **API·Automations** 또는 GitHub 트리거 (공식 문서 기준)
3. **L4** — `POST /cos/ci-proof` 또는 슬랙 `커서결과기록` / PR 링크

상세: **`COS_Execution_Worker_Layer_CloudFirst_v1.md`**, 페이로드: **`COS_Agent_Bridge_Outbound_v0.md`**.

---

## D. 대표 체크리스트

- [ ] A 1~5로 락인·승격·상태 확인
- [ ] B `협의모드:` 한 번 실행
- [ ] (선택) 브리지 + `커서발행` 후 클라우드/PR 움직임 확인
- [ ] “배포” 최소 정의 고정 (스테이징 URL | PR 머지 | 수단)

---

## Owner actions

```bash
cd /path/to/g1-cos-slack && npm test
```

SQL: 없음.
