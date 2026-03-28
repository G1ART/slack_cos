# 프로젝트 인테이크 Sticky 세션 — 근원 원인·런타임 계약

**Authority:** Runtime truth + 운영 지시  
**코드:** `projectIntakeSession.js`, `startProjectLockConfirmed.js` (확장), `tryExecutiveSurfaceResponse.js` (킥오프 시 `openProjectIntakeSession`), `scopeSufficiency.js` (후속 단계 문구 격리 + sticky 벤치마크 완화)

---

## 1. 대표 증상 (Henry 시나리오)

- 1턴: `start_project` 킥오프는 정상.
- 2턴: 답변 + `진행해줘`가 들어가도 **Council 합성**(한 줄 요약·종합 추천안·페르소나별·내부 처리 정보) 또는 **legacy primary/risk** 장문으로 새는 현상.

## 2. 근본 원인 (구조)

1. **`start_project` 킥오프는 “상태”를 남기지 않았다.**  
   후속 턴 판별이 **전적으로** `slackConversationBuffer` 전사 + “직전 COS 턴이 킥오프/정제 패턴인지”에 의존. 버퍼 비활성(`CONVERSATION_BUFFER_DISABLE` 등), 스레드 키 불일치, 메타 누락이면 **2턴째가 일반 대화·라우터 폴백**으로 떨어진다.

2. **충분성(sufficiency)이 “한 턴 길이”에 예민했다.**  
   후속 단계(외부 링크·결제 등) 문장이 합쳐지면 quarantine 없이 벤치마크/깊이 휴리스틱이 흔들릴 수 있다.

3. **AI 꼬리 우선순위.**  
   `runInboundAiRouter`에서 내비/플래너 이후 **dialog·(명시 시) council**로 새기 전에, **인테이크 세션이 열려 있으면** 대표 응답권을 `start_project_*`로 고정해야 한다.

## 3. 런타임 계약 (패치 후)

| 단계 | 동작 |
|------|------|
| 킥오프 응답 확정 | `openProjectIntakeSession(metadata, { goalLine })` — 스레드 키당 활성 세션 |
| 후속 턴 | `lastAssistantTurnWasKickoffOrRefine(transcript) \|\| isActiveProjectIntake(metadata)` 이면 잠금·정제 컨텍스트 유지 |
| 잠금 성공 | `completeProjectIntakeSession(metadata)` |
| 명령 라우터 | 잠금·정제 미스 후 **`tryProjectIntakeForcedRefineSurface`** — 세션만 살아 있어도 정제 표면 강제 |
| AI 꼬리 | 조회 직후 **`tryProjectIntakeExecutiveContinue`** — 세션 중엔 Council/dialog 앞에서 차단 |

## 4. 충분성 보조

- `quarantineFuturePhaseIdeas`: 후속 단계·외부·결제 한 줄은 MVP 판정에서 가중치 완화.
- `relaxBenchmarkForStickyIntake`: **활성 인테이크 세션**에서 잠금/정제 시 가벼운 벤치마크 휴리스틱을 완화(킥오프에서 이미 제품 맥락이 열렸다고 본다).

## 5. 회귀

- `scripts/test-henry-calendar-intake-regression.mjs` — 전사 없이 세션만으로 `start_project_confirmed` + Council 금지 문자열 없음.

## 6. 남은 리스크

- 세션은 **프로세스 메모리**만 — 멀티 인스턴스·재시작 시 상실. 필요 시 `CONVERSATION_BUFFER_PERSIST` 패턴과 유사 JSON 스냅샷 후속.
- 세션이 열린 스레드에서 **무관한 주제**로 말하면 정제 표면이 한동안 유지될 수 있음 — 상위 제품 정책으로 `완료`·`취소` 명시 턴 추가 가능.

---

### Owner actions

```bash
cd /path/to/g1-cos-slack
npm test
```
