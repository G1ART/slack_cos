# 택배사무소 — 코드 감사·슬랙 스모크 마무리 (2026-04-13)

정본: `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md` §4–5, `COS_Parcel_Multi_Product_Operations_2026-04-13.md`.

## 1. 추가 패치 필요 여부 (코드)

**택배사무소 A–C(게이트·뷰·wake·샤딩·요약·감사 스크립트) 기준으로 필수 추가 패치는 없다.**

근거:

- `npm run verify:parcel-post-office` — 14단계 회귀(게이트 불변식·뷰 SSOT·병합 예산·primary/advisory 분리·세션 접두사·필터·wake·런 스코프) 통과.
- `npm run verify:performance-contract` — 택배 묶음 + 콜백·집계 가드 통과.
- 페이즈 **D(고아 테이블 청소·쓰기 축소)** 와 **Phase G 백로그**는 의도적으로 별궤도(`COS_Cleanup_Phase_G_Backlog_2026-04-12.md`). 택배 “미완”이 아님.

### 선택 백로그 (당장 막지 않음)

| 항목 | 비고 |
|------|------|
| `audit:parcel-health` 배포별 필터 | `summarize` 는 `--session-prefix` 지원. 감사 스크립트는 여전히 뷰 전역 샘플 — 필요 시 뷰/RPC·클라이언트 필터 별도 설계. |
| `data/interaction-log.json` 등 로컬 런타임 파일 | 레포 정책에 따라 커밋 제외가 일반적. |

## 2. 슬랙 테스트 — 언제 필요한가

| 주장하는 범위 | 슬랙 테스트 |
|----------------|-------------|
| **백엔드·DB·택배 파이프 A–C만 “완료”** | **불필요.** 로컬 `verify:parcel-post-office` + `npm test` + (가능 시) `audit:parcel-health` 로 충분. |
| **“슬랙·Socket Mode·운영 스레드에서도 된다”** | **필요.** 비전 문서 §5 표 — 코드만으로는 현장 계약 증명 불가. |

## 3. 슬랙 스모크 후 무엇을 볼지 (체크리스트)

운영(또는 동일 토큰 스테이징)에서 **짧은 한 사이클**이면 된다.

1. **기동**  
   - 프로세스 기동 성공, Socket Mode 연결, `cos_runtime_truth` / health에 치명 오류 없음.  
   - `COS_OPS_SMOKE_ENABLED=1` 등 **스모크를 켤 환경**인지 의도 확인.

2. **대화 창구**  
   - Founder → COS: 멘션 또는 DM으로 한 턴 이상 응답 수신.  
   - **같은 스레드**에서 연속 턴이 이어지는지(스레드 키·메모리).

3. **클라우드·콜백 경로를 태울 때만**  
   - Cursor/트리거 한 번 수락 후, 콜백·run·supervisor 쪽이 **조용히 죽지 않는지**(앱 로그).  
   - 내부 정책상 원하면 `cos_run_events` / harness 요약으로 사후 확인.

4. **사후(선택, Supabase 있을 때)**  
   - `npm run audit:parcel-health -- --strict --strict-warnings-only --json` — 하드 `warnings` 비어 있음.  
   - `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 5`  
   - 멀티 배포면 `--session-prefix` 또는 고정 `COS_OPS_SMOKE_SESSION_ID` / `COS_OPS_SMOKE_SESSION_ID_PREFIX` 와 짝지을 것.

5. **기대하지 말 것**  
   - 슬랙 스모크 한 번으로 **페이즈 D 고아 비율**이 내려가지는 않음(감사 궤적과 별개).  
   - 택배사무소는 **관측·정렬·wake**에 가깝고, **COS 자연어 품질**은 별 검증.

## Owner actions

- 로컬: `npm run verify:parcel-post-office`, `npm test`, `npm run verify:performance-contract`
- DB: `npm run audit:parcel-health` (자격 있을 때)
- “슬랙까지 완료” 주장 시: 위 §3 스모크 1회
