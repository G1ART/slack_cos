# 택배사무소 — 멀티 제품·멀티 배포 운영 메모 (2026-04-13)

동일 Supabase 프로젝트에 여러 COS 인스턴스(제품·스테이징·레일웨이 서비스)가 이벤트를 쌓을 때의 리스크와 완화.

## 시나리오

1. **요약·감사가 전역**  
   `summarize-ops-smoke-sessions.mjs`·`audit:parcel-health`는 기본적으로 DB에 있는 스트림/이벤트를 한데 본다. 제품 A의 고아 비율이 B와 섞여 보일 수 있다.

2. **자동 `smoke_<ts>_<hex>`만 쓰는 배포**  
   세션 문자열에 제품 식별자가 없어, 운영자가 로그만으로 어느 배포인지 구분하기 어렵다.

3. **Slack·스레드**  
   스레드 키는 채널·루트 ts 기준이라 제품이 달라도 같은 워크스페이스면 채널 분리로 나누는 편이 안전하다. DB 쪽 `cos_run_events`는 여전히 공유면 런 UUID 충돌은 드물지만 요약은 섞인다.

4. **`npm run audit:parcel-health`**  
   현재는 뷰 전체 샘플 기준이다. 배포별 필터는 세션 접두사·별도 프로젝트·또는 향후 뷰/RPC 확장으로 보완한다.

## 선제 완화 (코드 반영)

- **`COS_OPS_SMOKE_SESSION_ID_PREFIX`**  
  `COS_OPS_SMOKE_SESSION_ID`가 비어 있을 때만, 자동 세션 ID 앞에 안전한 접두사를 붙인다(영숫자·`-`·`_`, 최대 32자, 나머지는 `_`로 정규화).

- **`node scripts/summarize-ops-smoke-sessions.mjs --session-prefix <p>`**  
  `smoke_session_id`가 `<p>`로 시작하는 세션만 `--limit` 적용 전에 걸러 낸다.

- **권장 운영**  
  배포마다 **`COS_OPS_SMOKE_SESSION_ID`를 고정**(예: `g1prod_ops_2026q2`)하거나, 접두사 + 요약 필터를 짝지어 쓴다.

## Owner actions

- `npm run verify:parcel-post-office`
- 배포 환경에 접두사 또는 고정 세션 ID 설정 후 Slack 스모크

## 관련

- `COS_Parcel_Observability_Primary_Advisory_2026-04-12.md`
- `.env.example` (`COS_OPS_SMOKE_SESSION_ID_PREFIX`)
