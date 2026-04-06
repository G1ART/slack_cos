# G1 COS CONSTITUTION
## The Only Governing Document
## Version 2.1 — Memory spine + model-native tools

---

# 0. 지위

이 문서는 저장소의 **유일한 헌법**이다. 다른 거버넌스·핸드오프·북극성 문서는 두지 않는다.

---

# 1. 정체성: Founder ↔ COS ↔ Harness ↔ Tools

```text
Founder (Slack)
↕
COS (OpenAI API)
↕
Harness (multi-persona AI agent team)
↕
External tools (Cursor, GitHub, Supabase, Vercel, Railway 등)
```

- Founder는 **COS만** 본다.
- Harness와 외부 툴은 **COS 뒤**에만 존재한다.
- 앱 코드는 이 척추를 전달하는 **최소 운반체**만 둔다.

---

# 2. 최소 운반체

허용:
- Slack 이벤트 수신 (멘션, DM)
- thread / channel / user 식별
- **현재 턴** 텍스트·첨부 전달
- COS 응답을 Slack으로 송신
- 실행 경계에서 permission / lineage / truth boundary 연결 (toolsBridge)

금지:
- 키워드·의도 분류·커맨드 라우터·플래너·Council·승인·패킷·대화 버퍼 재주입
- founder 발화를 앱이 “해석”하는 것

**무슨 말인지는 COS가 이해한다. 앱은 옮긴다.**

---

# 3. 대화와 실행의 분리

- Founder ↔ COS: 자유 자연어 대화 (scope lock 포함, **COS가 대화 안에서** 수행)
- COS ↔ Harness / Tools: 엄격한 실행층 (브리지 코드 뒤에서만)

---

# 4. 배포 경로 (단일)

```text
Slack founder event
→ registerFounderHandlers
→ handleFounderSlackTurn
→ runFounderDirectConversation
→ sendFounderResponse
```

실행 단계는 COS 판단 뒤에만:

```text
runFounderDirectConversation
→ harnessBridge (필요 시)
→ toolsBridge (필요 시)
→ Founder에게 자연어 보고
```

---

# 5. 응답 원칙

COS는 Founder에게 한국어 자연어로, 맥락에 맞게, 과한 시스템 노출 없이 답한다.  
별도 보고서/Council/등록 포맷터를 앱이 붙이지 않는다.

---

# 6. founder 경로 금지 문자열 (코드가 이 절에서 목록을 파싱한다)

## 6.1 founder 경로에서 금지되는 것

아래 문자열·패턴은 **출력에 포함되면 안 된다** (앱은 생성 금지 검사를 한다; 치환·살리지 않는다).

- handleUserText
- AI router
- command router
- planner router
- council synthesis
- proposal surface
- approval surface
- packet surface
- 업무등록
- 계획등록
- 협의모드
- 실행 작업 후보
- 대표보고서
- 한 줄 요약
- 종합 추천안
- 페르소나별 핵심 관점
- 가장 강한 반대 논리
- 남아 있는 긴장 / 미해결 충돌
- 핵심 리스크
- 다음 행동
- 대표 결정 필요 여부
- 내부 처리 정보
- 참여 페르소나
- matrix trigger
- institutional memory hint count
- strategy_finance
- ops_grants
- risk_review
- product_ux

---

# 7. 첨부

첨부는 **현재 턴** 맥락만이다. 라우팅 트리거·영구 document context·플래너 재주입을 하지 않는다.

지원 범위 (코드): PNG, JPG, JPEG, WEBP, DOCX, 텍스트 레이어가 있는 PDF.

---

# 8. 멀티턴 연속성

- founder와 COS는 여러 턴에 걸쳐 scope를 좁혀가고 락인할 수 있어야 한다.
- thread 단위 **raw transcript memory**(user/assistant 원문·첨부 요약)만 사용할 수 있다.
- intent label, routing label, planner artifact, council memo 등 **semantic routing state**는 저장하지 않는다.

---

# 9. Model-native orchestration

- scope가 충분히 락인된 뒤, COS는 Responses API **tool-call**로 `delegate_harness_team` · `invoke_external_tool` 을 직접 선택할 수 있다.
- 이 선택은 앱 코드의 실행 분기가 아니라 **모델의 선택**이어야 한다.
- 앱은 tool-call을 중개·실행하고 결과를 모델에 되돌려 줄 뿐이다.
- founder에게 내부 tool 이름·원시 페이로드를 그대로 노출하지 않는다.
