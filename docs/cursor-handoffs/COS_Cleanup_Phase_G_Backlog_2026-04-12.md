# Phase G — 대청소 백로그 (2026-04-12)

**시작 조건**: `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md` 페이즈 D 전제(고아 비율·감사 행 SSOT)를 만족한 뒤에만 실행. 임의 삭제 금지.

## G0 — 문서·런북만 (코드 삭제 없음)

1. `COS_Ops_Smoke_Callback_Pipeline_Audit_2026-04-01.md` 6절 후보와 본 백로그를 주기적으로 대조.
2. `npm run verify:performance-contract` 를 CI 또는 수동 릴리스 게이트에 포함할지 결정.

## G1 — 중복 쓰기·바이패스 (감사 후)

- 동일 의미의 이벤트가 두 테이블에만 존재하는 레거시 경로가 있는지 `audit-parcel-health` 샘플로 확인 후 축소.

## G2 — 레거시 플래그

- 사용처 grep → 테스트·문서 갱신 → 제거. 한 축씩 PR.

## G3 — 데드 코드

- export 미사용·미참조 모듈은 커버리지가 아닌 **import 그래프**로 확인 후 제거.

이 파일은 **정렬된 할 일 목록**이며, 항목 완료 시 본문에 날짜·커밋 해시를 남긴다.
