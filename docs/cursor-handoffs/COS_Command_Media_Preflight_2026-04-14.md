# COS command media — 패치·운영 전 필독 (2026-04-14)

**역할:** “command”는 `npm` 스크립트·CLI 플래그·환경 변수로 **기계가 실행하는 표면**이고, “media”는 그 표면의 **정본이 되는 핸드오프 Markdown**이다. 구현·감사·릴리스 게이트를 건드리기 전에 아래를 **한 세트**로 읽는다.

## 1. 거버넌스·제품·로드맵 (기존 필독과 동일 순서)

1. **`CONSTITUTION.md`** — 유일 헌법; founder 경로·택배사무소 코어 non-goals.
2. **`WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md`** — 제품 SSOT 동반 문서.
3. **`G1_COS_Upgrade_Roadmap_2026-04-14.md`** — M1~M10, non-goals, 순서.

## 2. 운영 명령 + 테넄시·감사 정본 (이 문서가 “command media” 축)

4. **`COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md`** — `COS_*` 테넄시 키, `audit:parcel-health` 플래그·JSON 필드, 감사 임계 env, `cos_runs_recent_by_tenancy` RPC 포인터.
5. **`COS_Release_Readiness_Checklist_2026-04-16.md`** — 사람 손 단계 vs `npm test` / `verify:parcel-post-office` 묶음.

## 3. 자주 쓰는 npm 표면 (레포 루트)

| 명령 | 용도 |
|------|------|
| `npm test` | 헌법·스파인·봉투·감사 형상 등 전역 회귀 |
| `npm run verify:parcel-post-office` | 택배 게이트·뷰 SSOT·wake·RPC SSOT 등 짧은 묶음 |
| `npm run audit:parcel-health` | Supabase 자격 있을 때 운영 DB 샘플·`warnings` / `advisory` ( `--json` 권장 ) |
| `node scripts/summarize-ops-smoke-sessions.mjs --store supabase …` | 세션 단위 요약(테넌시 플래그는 테넌시 가이드와 동일 어휘) |

택배사무소 핵심(콜백 권위·클로저)은 **회귀 입증 없이** 다시 열지 않는다.

## 로컬 Cursor 규칙

레포는 `.cursor/`를 gitignore 한다. 동일 필독을 에이전트에 항상 걸고 싶으면 로컬 `.cursor/rules/`에 위 1~5 경로를 복사한 규칙 파일을 두면 된다. **팀 공유 SSOT는 이 파일과 위 링크 대상 문서들이다.**
