# SLACK TEST PACK — Operations Loop Closure v1

**구현 메모 (실행 전 읽기)**

| 항목 | 내용 |
|------|------|
| **TEST 5A** | `계획승인`은 **`PLN_ID`** 인자입니다. `계획승인 APR_ID`는 동작하지 않습니다. planner APR 텍스트 승인은 `승인 <APR 내부 id 또는 approval_key>` 를 사용하세요. |
| **WRK 개수** | TEST 1 요청이 bullet 없이 한 덩어리면 **WRK 1개**만 생길 수 있습니다. 이 경우 TEST 16의 `WRK_ID_3`는 생략하고, TEST 15/17는 “남은 work” 기준으로 진행하세요. |
| **TEST 2** | 자연어 진입은 `extractPlannerRequest` 패턴에 맞는 문장이어야 합니다. 예: `이 작업을 단계별 계획으로 나눠줘` (권장). |

---

## 사전 규칙

- 첫 응답에서 나온 `PLN-...`, `WRK-...`, `APR-...`를 바로 복사해 아래 placeholder에 넣는다.
- 각 단계마다 응답 전문을 저장한다.
- 실패 시 “명령 / 실제 응답 / 기대 응답” 3줄만 남긴다.

---

## TEST 1 — planner 생성

**입력**

```text
계획등록: slack_cos에서 업무상세에 github issue state와 cursor handoff path를 함께 보여주는 요약 줄을 추가해줘.
```

**기대**

- `Plan: PLN-...`
- `Works: WRK-...`
- `Approval: yes/no`
- 필요 시 `Approval ID: APR-...`
- `Next:`가 보임
- Council fallback성 문구가 본문을 덮지 않음

**기록**

```text
PLN_ID=
WRK_ID_1=
WRK_ID_2=
APR_ID=
```

---

## TEST 2 — planner 자연어 진입

**입력**

```text
이 작업을 단계별 계획으로 나눠줘
```

**기대**

- planner로 처리되거나 planner 유도 응답
- 최소한 일반 Council 잡답으로 끝나지 않음

---

## TEST 3 — 계획상세

**입력**

```text
계획상세 PLN_ID
```

**기대**

- plan id 표시
- overall status 표시
- child work 목록 표시
- 각 work status 표시
- approval summary 표시
- next allowed actions 표시

---

## TEST 4 — 계획발행목록

**입력**

```text
계획발행목록 PLN_ID
```

**기대**

- 각 WRK 표시
- github 연결 여부 표시
- cursor 연결 여부 표시
- review 상태 표시
- done 여부 표시

---

## TEST 5A — approval required 인 경우

**입력 (수정)** — plan 승인:

```text
계획승인 PLN_ID
```

(planner APR만 Slack 승인 명령으로 닫을 경우: `승인 <APR id 또는 key> : 메모`)

**기대**

- approval/plan 흐름에 맞게 승인 반영
- 이후 발행 가능 상태가 보임

---

## TEST 5B — approval not required 인 경우

이 단계는 건너뜀

---

## TEST 6 — 계획진행 초기 상태

**입력**

```text
계획진행 PLN_ID
```

**기대**

- total work 수 표시
- approved / dispatched / review_requested / needs_revision / done / blocked count 표시
- 아직 미종결 상태가 보임

---

## TEST 7 — 업무상세 초기 상태

**입력**

```text
업무상세 WRK_ID_1
```

**기대**

- work id
- parent plan id
- lifecycle status
- GitHub 요약 1줄
- Cursor 요약 1줄
- Review 요약 1줄
- latest run 또는 결과 상태
- next actions

---

## TEST 8 — 커서발행

**입력**

```text
커서발행 WRK_ID_1
```

**기대**

- 성공 응답
- work 상태가 dispatched 또는 in_progress
- 업무상세에서 Cursor 쪽 상태가 바뀜

**후속 확인**

```text
업무상세 WRK_ID_1
```

**기대**

- `Cursor: dispatched` 또는 동등 상태

---

## TEST 9 — 결과기록 → review_requested

**입력**

```text
커서결과기록 WRK_ID_1 결과 반영 완료, 요약 줄 추가 구현
```

**기대**

- 성공 응답
- work 상태가 `review_requested` 또는 동등 상태

**후속 확인**

```text
업무상세 WRK_ID_1
```

**기대**

- `Review: pending` 또는 `review_requested`
- latest result/update 반영

---

## TEST 10 — 업무검토

**입력**

```text
업무검토 WRK_ID_1
```

**기대**

- 읽기 전용 요약
- 현재 결과/연결 상태/검토 대기 여부가 한눈에 보임

---

## TEST 11 — 업무수정요청

**입력**

```text
업무수정요청 WRK_ID_1 요약줄 포맷을 더 간결하게 수정
```

**기대**

- 상태가 `needs_revision`
- 수정 사유 또는 last action note가 반영

**후속 확인**

```text
업무상세 WRK_ID_1
```

**기대**

- `Review: needs_revision` 또는 동등 상태

---

## TEST 12 — 재결과기록

**입력**

```text
커서결과기록 WRK_ID_1 수정 반영 완료, 요약줄을 한 줄로 축약
```

**기대**

- latest result 갱신
- 상태가 다시 `review_requested` 또는 검토 대기 상태

**후속 확인**

```text
업무상세 WRK_ID_1
```

**기대**

- 이전 결과가 아닌 최신 결과 기준으로 표시

---

## TEST 13 — 업무완료

**입력**

```text
업무완료 WRK_ID_1
```

**기대**

- 상태가 `done`

**후속 확인**

```text
업무상세 WRK_ID_1
```

**기대**

- `done` 표시
- next action이 축소되거나 완료형으로 바뀜

---

## TEST 14 — 업무완료 idempotent

**입력**

```text
업무완료 WRK_ID_1
```

**기대**

- 에러 없이 “이미 완료” 또는 no-op 처리

---

## TEST 15 — 계획완료 가드

**입력**

```text
계획완료 PLN_ID
```

**기대**

- 아직 다른 child work 미완료면 완료 거부
- 남은 WRK 목록 또는 상태 표시

---

## TEST 16 — 나머지 work 종료

**입력**

```text
업무완료 WRK_ID_2
업무완료 WRK_ID_3
```

(WRK가 1개뿐이면 생략)

**기대**

- 각 work가 done 처리

---

## TEST 17 — 계획완료 성공

**입력**

```text
계획완료 PLN_ID
```

**기대**

- plan 완료 처리
- 전체 상태가 done 또는 completed

**후속 확인**

```text
계획상세 PLN_ID
```

**기대**

- all child done
- overall done

---

## TEST 18 — dedup

**입력 1**

```text
계획등록: slack_cos에서 업무상세에 github issue state와 cursor handoff path를 함께 보여주는 요약 줄을 추가해줘.
```

**입력 2** (동일, 120초 이내)

```text
계획등록: slack_cos에서 업무상세에 github issue state와 cursor handoff path를 함께 보여주는 요약 줄을 추가해줘.
```

**기대**

- 짧은 시간 내 중복 생성이 폭발하지 않음
- dedup 또는 안전한 중복 처리
- 저장 꼬임 없음

---

## TEST 19 — malformed planner

**입력**

```text
계획등록:
```

**기대**

- Council fallback으로 새는 대신
- planner 형식 오류/입력 보완 안내만 반환

---

## TEST 20 — 존재하지 않는 ID

**입력**

```text
업무상세 WRK-DOES-NOT-EXIST
```

**기대**

- 안전한 not found 응답
- 크래시 없음

---

## 최소 통과 기준

**반드시 통과**

- TEST 1, 3, 4, 8, 9, 11, 13, 15, 17, 19, 20

**통과하면 좋은 것**

- TEST 2, 14, 18
