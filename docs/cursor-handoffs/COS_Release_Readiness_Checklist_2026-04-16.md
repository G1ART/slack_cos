# 출시·재배포 점검 체크리스트 (2026-04-16)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md`, `COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md`, 루트 `AGENTS.md`.

목적: **한 사람이 손으로 해야 하는 단계**와 **레포·CI로 자동화 가능한 단계**를 나눈다. 에이전트는 후자를 끝까지 구현하고, 전자가 필요할 때만 멈춘다.

## 1. Supabase (운영 DB)

- [ ] 마이그레이션 적용 여부: 최소 `20260414120000`, `20260415120000`, `20260416130000` (뷰·`cos_runs` 테넄시 컬럼). 레포 `supabase/migrations/` SSOT.
- [ ] `cos_ops_smoke_summary_stream` 뷰가 깨지지 않았는지(열 순서 변경 시 `42P16` 주의 — 에픽 문서 참고).

## 2. Railway(또는 호스트) 환경 변수

- [ ] Slack·OpenAI·Cursor 웹훅 시크릿 등 **필수** 키 (`AGENTS.md`, `.env.example`).
- [ ] 선택이지만 출시 품질: `COS_PARCEL_DEPLOYMENT_KEY` (감사·요약 슬라이스), 필요 시 `COS_WORKSPACE_KEY` 등.
- [ ] 부트 로그 `cos_runtime_truth` 에 `tenancy_keys_presence` 가 기대와 맞는지(값 아님 **설정 여부만**).

## 3. 자동 검증 (개입 없이 실행 가능)

- [ ] 레포 루트: `npm test`
- [ ] `npm run verify:parcel-post-office`

## 4. 개입 필요(여기서 멈추고 담당자가 실행)

- [ ] **Slack 스모크:** 실제 워크스페이스에서 멘션 한 턴·콜백 경로 확인 (Socket Mode·토큰).
- [ ] **Cursor Cloud live emit_patch** 등 비용·외부 계정이 드는 경로는 정책에 맞게만.
- [ ] 운영 `npm run audit:parcel-health` (Supabase 자격 필요) — 샘플·경고 해석.

## 5. Git

- [ ] `git pull --rebase` → `git push` 로 원격과 맞춤 (다중 세션 시 필수).

## Owner actions

- 배포 직후: `GET /healthz` 또는 Railway 헬스.
- 이 파일은 **체크리스트만** 유지하고, 절차 본문은 에픽·테넌시 가이드에 두지 않는다.
