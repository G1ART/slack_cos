# G1 COS CONSTITUTION
## The Only Governing Document
## Version 1.0 — Founder Review Draft (Rewritten)

---

# 0. 이 문서의 지위

이 문서는 G1 COS의 **유일한 헌법**이다.

이 문서가 승인되면:
- 기존 north star 문서
- reset / reconstruction / release lock 문서
- founder path 보강 문서
- handoff 안의 철학/원칙 중복 서술
- 기타 모든 거버넌스 문서

는 **전부 폐기**한다.

보존 예외는 없다.  
철학, 구조, 금지사항, 개발 원칙, 배포 원칙은 **이 문서 하나만** 정의한다.

이 문서는 설명문이 아니라 **헌법**이다.  
즉 무엇을 만들고, 무엇을 금지하며, 무엇을 반드시 삭제해야 하는지를 정한다.

---

# 1. 우리가 만드는 것

우리가 만드는 것은 슬랙봇이 아니다.

우리가 만드는 것은 다음이다.

> **Slack 안에서 founder와 직접 대화하는 단일 COS**
>  
> 그리고 그 COS가 founder의 의도를 충분히 이해하고 scope를 lock한 뒤,
> 뒤에서 하네스 AI agents와 외부 툴을 조용히 orchestrate하여
> 실제 결과를 만들어내는 시스템.

한 줄로 줄이면:

> **Slack 안의 ChatGPT형 COS + 뒤에서 일하는 실행 조직**

---

# 2. 최상위 원칙

## 2.1 Founder와 COS 사이에는 의미 해석 코드가 있어선 안 된다
founder 발화의 의미를 앱 코드가 먼저 분류하거나 해석하면 안 된다.

금지:
- intent classifier
- keyword router
- command router
- planner router
- council mode selector
- work candidate detector
- registration suggester
- proposal formatter
- approval formatter
- packet renderer
- report renderer

founder 발화는 **COS가 이해해야 한다.**

## 2.2 모델만으로는 충분하지 않고, 그러나 최소 운반체만 허용된다
Slack 안에 GPT API를 붙여놓았다고 해서 모델이 스스로
- Slack 이벤트를 수신하고
- thread를 식별하고
- attachment를 읽고
- 응답을 Slack으로 송신하고
- 외부 툴을 호출할 수는 없다.

따라서 **최소 운반체(minimal transport shell)** 는 필요하다.

하지만 그 최소 운반체는 오직 아래만 해야 한다.

- Slack 이벤트 수신
- founder identity / channel / thread binding
- current-turn attachment 전달
- 최소한의 project/runtime context 전달
- COS 응답 송신
- 실행층 호출 시 permission / lineage / truth boundary 연결

이 운반체는 **의미 해석기**가 아니어야 한다.  
즉, “무슨 말을 했는가”는 COS가 이해하고, 운반체는 그 말을 옮기기만 해야 한다.

## 2.3 대화와 실행은 분리된다
- founder ↔ COS = 자유 대화층
- COS ↔ tools/agents = 엄격 실행층

대화는 자연어로, 실행은 경계와 증거로.

## 2.4 founder 경험은 ChatGPT와 같아야 한다
founder는 Slack 안에서 다음을 느껴야 한다.

> “COS가 내 말을 이해했고, 필요한 만큼만 물으며, 점점 구체화하고 있다.”

founder는 다음을 느껴선 안 된다.
- 앱이 내 말을 분류하고 있구나
- command parser가 돌고 있구나
- registration mode로 넘어갔구나
- council이 나왔구나
- packet / approval / queue 세계가 보이네

---

# 3. 시스템 구조

## 3.1 전체 구조

```text
Founder in Slack
    │
    ▼
Minimal Transport Shell
    │
    ▼
COS Direct Conversation Core
    │
    ├── current-turn text
    ├── current-turn attachments
    ├── minimal thread/project context
    └── scope refinement / lock
    │
    ▼
Execution Boundary
    │
    ├── permission
    ├── approval lineage
    ├── truth / reconciliation
    └── artifact validity
    │
    ▼
Orchestration Layer
    │
    ├── Harness AI agents
    ├── Cursor
    ├── GitHub
    ├── Supabase
    ├── Vercel / Railway
    └── future tools
    │
    ▼
COS Natural Response in Slack
```

## 3.2 이 구조에서 핵심은 단 하나다
Slack 안의 COS는 **직접 대화하는 주체**여야 한다.  
앱 코드는 그 대화를 “계획/협의/등록/승인 포맷”으로 변형해선 안 된다.

---

# 4. Founder 경로의 정의

## 4.1 founder 배포 경로는 단 하나다

```text
Slack founder event
→ founder conversation controller
→ COS direct conversation core
→ founder response sender
```

## 4.2 founder 경로에서 허용되는 것
- raw founder text
- current-turn attachment ingest
- thread binding
- minimal context attachment
- direct model conversation
- response send

## 4.3 founder 경로에서 금지되는 것
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

이것들은 strip 대상이 아니라 **생성 금지 대상**이다.

---

# 5. 응답 원칙

COS는 founder에게
- 한국어 자연어로
- 맥락을 반영하여
- 과도한 시스템 설명 없이
- 필요한 만큼만 구조화하여
- 바로 다음 의사결정을 돕는 방식으로
답해야 한다.

이 원칙은 별도 formatter로 구현하는 것이 아니다.  
이 원칙은 **모델에게 주는 직접 지시**이자, founder 응답 생성의 본체여야 한다.

즉:
- 보고서 생성 코드 금지
- council formatter 금지
- persona bullet formatter 금지
- registration suggester 금지

모델이 직접 이 원칙에 따라 founder에게 답해야 한다.

---

# 6. Scope lock 원칙

scope lock은 앱 코드가 하지 않는다.  
COS가 한다.

즉:
1. founder가 말한다
2. COS가 이해한다
3. 아직 모호하면 COS가 묻는다
4. 충분히 구체화되면 COS가 lock한다
5. lock 이후 COS가 뒤에서 실행을 조직한다

lock 기준은 코드 분기가 아니라 **COS의 이해 충족**이다.

---

# 7. Attachment 원칙

## 7.1 첨부는 routing trigger가 아니다
첨부파일은 founder 경로를 다른 모드로 보내는 트리거가 아니다.

첨부는 오직:
- current-turn context
- understanding aid
- evidence source

다.

## 7.2 첨부 성공
- 같은 자연어 표면에서 반영
- 별도 file mode 금지
- 별도 report mode 금지

## 7.3 첨부 실패
- 같은 자연어 표면에서 짧고 사실대로 설명
- 내부 error code 금지
- 별도 failure renderer 금지
- planner / council / packet 세계로 전환 금지

## 7.4 최소 지원 형식
현재 최소 지원 목표:
- PNG
- JPG / JPEG
- WEBP
- DOCX
- 텍스트 레이어가 있는 PDF

하지만 형식 지원보다 중요한 것은:
> 실패해도 founder 경험이 깨지지 않는 것

---

# 8. 실행층 원칙

## 8.1 execution은 COS 책임이다
founder는 실행 경로를 조작하지 않는다.  
COS가 orchestrate 한다.

## 8.2 execution boundary가 하는 일
- permission 확인
- approval lineage 확인
- truth / reconciliation
- artifact validity 확인

## 8.3 founder 표면에 절대 나오면 안 되는 것
- internal packet
- approval graph
- execution mode decision
- council synthesis
- governance advisory topics
- routing labels
- internal trace

이것들은 내부에서만 존재할 수 있다.

---

# 9. Memory / state 원칙

## 9.1 founder 기본 대화는 current-turn 우선
기본 founder 대화 경로는
- current-turn text
- current-turn attachment
- 필요한 최소 context
만으로 작동해야 한다.

## 9.2 transcript 오염 금지
과거 assistant 출력이 founder prompt를 오염시키면 안 된다.

즉 다음은 founder prompt에 재주입 금지:
- 과거 council 답변
- fallback 문구
- 시스템성 surface
- registration 유도 문구

## 9.3 runtime state 저장 원칙
runtime state는 repo tracked path에 있어선 안 된다.
- repo 밖 runtime dir
- tmp/runtime dir 또는 외부 저장소
- Git commit 오염 금지

---

# 10. 헌법을 코드에 “뼈처럼 박는” 방법

대표님 질문의 핵심은 이것이다:
> 컨텍스트가 길어지면 축약/누락되는데, 이 헌법의 한 글자 한 글자를 어떻게 Cursor와 코드에 박을 것인가?

답은 “문서를 많이 쓰는 것”이 아니라 **실행 강제장치**다.

## 10.1 단일 파일 강제
repo 최상위에 `CONSTITUTION.md` 하나만 둔다.  
거버넌스 문서는 이 파일 하나뿐이다.

## 10.2 문서 다중화 금지
다른 철학/원칙 문서를 만들면 CI 실패.

## 10.3 부팅 시 헌법 로드
배포 앱은 시작할 때 `CONSTITUTION.md`를 읽고,
그 중 founder direct conversation section과 금지 목록 section을
모델 system instructions에 직접 주입해야 한다.

즉 헌법은 “문서”가 아니라 **런타임 입력**이어야 한다.

## 10.4 위반 문자열 금지 테스트
배포 경로 코드에서 다음 문자열이 발견되면 테스트 실패:
- 업무등록
- 계획등록
- 협의모드
- 실행 작업 후보
- 한 줄 요약
- 종합 추천안
- 페르소나별 핵심 관점
- 핵심 리스크
- 내부 처리 정보
- 참여 페르소나

## 10.5 금지 import 테스트
배포 엔트리포인트와 founder 경로에서 금지 import가 보이면 테스트 실패:
- handleUserText
- runInboundAiRouter
- runInboundCommandRouter
- founderRequestPipeline
- council / packet / planner helper

## 10.6 단일 엔트리포인트 강제
배포 앱 start command는 founder-only entry 하나만 허용.

## 10.7 헌법 해시 고정
선택이 아니라 권장 강제:
- `CONSTITUTION.md` SHA256을 계산해 런타임에 출력
- 테스트도 그 해시를 기대값으로 검증
- 헌법이 바뀌면 해시도 바뀌므로, “문서만 바꾸고 코드 반영 안 됨” 상태를 막을 수 있다

즉, 대표님이 원하신 “뼈에 박기”는
- 단일 파일
- 런타임 로드
- 테스트 강제
- 해시 고정
으로 구현한다.

---

# 11. 구현 원칙

## 11.1 add보다 delete
문제가 생기면 먼저 묻는다.
> 이걸 만드는 기존 코드를 지울 수 없는가?

새 분기, 새 가드, 새 예외, 새 래퍼를 먼저 추가하지 않는다.

## 11.2 founder 경로는 짧아야 한다
이상적 founder 경로:
- entrypoint
- founder controller
- founder conversation core
- founder response sender
- attachment ingest

그 이상으로 커지면 실패 쪽으로 본다.

## 11.3 자연어는 포장재가 아니다
자연어는 마지막에 예쁘게 씌우는 표면이 아니라,
**처음부터 founder가 마주하는 본래 인터페이스**여야 한다.

---

# 12. 전면 폐기 규정

이 헌법 승인 즉시:
- 기존 거버넌스 문서 전부 삭제
- 기존 north star 문서 전부 삭제
- reconstruction/reset/release lock 문서 전부 삭제
- founder path doctrine 문서 전부 삭제

남기는 예외는 없다.

그리고 새 구현 지시도 다음 원칙을 따라야 한다:
> 기존 좀비 세계를 보수하지 말고, 배포 경로를 통째로 새로 쓴다.

---

# 13. 최종 선언

> G1 COS는 Slack 안에서 founder와 자연스럽게 대화하는 단일 COS여야 한다.  
> founder 발화를 앱 코드가 해석·분류·등록 유도·협의모드화해서는 안 된다.  
> 모델과 founder 사이에는 최소 운반체만 존재할 수 있으며, 그 운반체는 의미를 해석하지 않는다.  
> 대화는 자유롭게, 실행은 뒤에서 엄격하게.  
> 이 문서 하나만이 그 구조를 정의하는 유일한 헌법이다.
