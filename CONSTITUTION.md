# G1 COS CONSTITUTION
## The Only Governing Document
## Version 2.5 — Real adapters, specialized packets, ledger as visibility spine

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

### Founder ↔ COS (추가 원칙)

- founder와 COS 사이에는 **의미 해석 코드가 없다**.
- thread 연속성을 위한 **raw transcript memory**와 Slack I/O만 있다.
- founder는 오직 COS 자연어 응답만 본다 (내부 code/name/message 노출 금지).

### COS ↔ Harness ↔ Tools (추가 원칙)

- Harness **팀**은 COS가 그때그때 설계하는 **내부 실행 조직**이다. **team shape**는 COS가 정한다.
- **external tool choice**는 COS가 정한다.
- 앱 코드는 **adapter**와 **evidence ledger**만 제공한다 (판단기·통제기 아님).
- 실행 artifact(harness dispatch·task packet 봉투·tool invocation 등)는 **founder에게 직접 보이지 않고**, COS 내부 실행 문맥·ledger로만 남는다.
- **Task packet**은 통제 규칙이 아니라, COS가 내린 지시를 외부 실행기에 넘기기 위한 **canonical envelope(전달용 봉투)** 이다. 앱은 의미를 해석하지 않는다.
- **external tool invocation**은 **live**(실제 API가 성공한 경우) 또는 **artifact**(런타임에 기록된 대체 산출물) 모두 **실행 사실**이다. 자격 증명만으로 **가짜 live**(스텁만 수행하며 live로 표기)는 허용되지 않는다.
- **execution ledger**는 COS가 실행층을 감시·조율하기 위한 **visibility spine**이다.
- 과사용·독단·편향이 있는 에이전트 조율은 **COS의 책임**이며, **COS가 ledger·실행 기록 visibility**를 바탕으로 수행한다. 코드는 visibility만 제공하고 감시·우선순위를 대신 정하지 않는다.

### 런타임 policing (재확인)

- 코드가 대화 성숙도를 판단하지 않는다.
- 코드가 founder 응답 표현을 감시하지 않는다.
- 규범은 헌법 + 모델 지시 + 테스트로 강제한다.

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
- 앱이 대화의 성숙도·의도·표현을 보고 tool-call 허용 여부를 정하는 것
- 런타임에서 founder/COS 응답 본문을 금지어·패턴으로 감시하는 것

**무슨 말인지는 COS가 이해한다. 앱은 옮긴다.**  
**scope 락인은 COS(모델)가 대화 속에서 수행한다. 앱 코드는 판단하지 않는다.**

---

# 3. 대화와 실행의 분리

- Founder ↔ COS: 자유 자연어 대화 (scope lock 포함, **COS가 대화 안에서** 수행)
- COS ↔ Harness / Tools: 엄격한 실행층 (브리지·ledger 뒤에서만)

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

# 6. founder 경로 금지 문자열 (모델·테스트로 강제)

## 6.1 founder 경로에서 금지되는 것

아래 문자열·패턴은 **COS가 founder에게 출력해서는 안 된다**.  
규범 준수는 **시스템 instruction과 `npm test`(헌법 파생 검사)** 로 강제한다.  
**프로덕션 런타임은 응답 본문을 금지어로 검사하지 않는다** (pass-through 송신).

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
- DM은 **채널 단일 키**로 하나의 연속 대화로 이어진다. 채널 멘션 스레드는 **root thread 단일 키**로 이어진다.
- **assistant** 턴은 Slack 송신이 성공한 뒤에만 raw memory에 남긴다 (전달 확인).
- assistant 턴의 **attachments** 슬롯에는 해당 턴의 첨부 요약을 넣어 다음 턴 연속성을 돕는다 (founder 노출 텍스트와 별개).
- thread 단위 **raw transcript memory**(user/assistant 원문·첨부 요약)만 사용할 수 있다.
- intent label, routing label, planner artifact, council memo 등 **semantic routing state**는 저장하지 않는다.

---

# 9. Model-native orchestration

- **언제** tool-call을 할지는 COS가 스스로 판단한다 (질문으로 scope를 잡을지, 락인 후 호출할지).
- COS는 orchestration의 **지휘자**다. Harness 조직과 외부 도구 선택·순서를 모델이 최적화한다.
- 앱은 허용 tool 이름·action enum·payload 타입 같은 **기계적 스키마 검증**과 adapter 실행만 하고, 대화가 “충분한지”는 판단하지 않는다.
- COS는 Responses API **tool-call**로 `delegate_harness_team` · `invoke_external_tool` · (선택) `record_execution_note` · `read_execution_context` 를 쓸 수 있다.
- `invoke_external_tool` 은 **도구별 허용 action** 조합만 스키마로 검증한다 (통제가 아니라 기계적 계약).
- harness dispatch·task packet·tool invocation·tool 결과 등 실행 증거는 thread 단위 **execution ledger**에 남길 수 있다 (founder 비노출).
- 모델 입력의 실행 요약은 ledger를 한 줄 요약으로만 넣어 **visibility는 높이고 context 오염은 줄인다**.
- 앱은 tool-call을 실행하고 결과를 모델에 되돌려 줄 뿐이다.
- founder에게 내부 tool 이름·원시 페이로드를 그대로 노출하지 않는다.
