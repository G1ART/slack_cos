# Phase 1 — 레이어 간 최소 봉투 (SSOT 초안, 2026-04-15)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md` 의 Phase 1 · 실패 방지선 3번(같은 run/packet 언어).

**목적:** COS ↔ Harness ↔ 외부툴이 **같은 식별자·상태 어휘**를 쓰게 고정한다. 이 문서는 필드 **이름과 역할**만 잠그고, 구현은 기존 코드·테이블에 점진적으로 붙인다.

## 1. 정체성 · 테넄시 (이미 코드와 정합)

| 필드 | 의미 | 레포에서의 SSOT |
|------|------|-----------------|
| `slack_app_id` | Slack 앱 인스턴스 (멀티 앱 대비) | `cosSlackAppIdentity.js` · env `COS_SLACK_APP_ID` |
| `workspace_key` | 워크스페이스·동등 테넌트 | `parcelDeploymentContext.js` · `COS_WORKSPACE_KEY` |
| `product_key` | 제품 단위 | `COS_PRODUCT_KEY` |
| `project_space_key` | 프로젝트·스코프 | `COS_PROJECT_SPACE_KEY` |
| `parcel_deployment_key` / deployment 축 | 배포·환경 | `COS_PARCEL_DEPLOYMENT_KEY` |

요약 스모크 이벤트에는 위 테넄시 키가 payload·`cos_ops_smoke_summary_stream` 뷰로 이미 태깅 가능하다.

## 2. 실행 봉투 — 반드시 통일할 식별자

코드 SSOT (요약 이벤트 payload 병합): `src/founder/canonicalExecutionEnvelope.js` (`mergeCanonicalExecutionEnvelopeToPayload`, 로드맵 M1).

| 필드 | 의미 | 비고 |
|------|------|------|
| `run_id` | 지속 run UUID (`cos_runs` 등) | 이미 전역 사용 |
| `packet_id` | 패킷·delegate 항목 단위 식별 (있을 때) | 하네스·ledger와 동일 문자열 |
| `thread_key` | Slack 스레드 상관 | founder 루프·supervisor |
| `smoke_session_id` | ops 스모크 세션 (있을 때) | 요약·감사 |

## 3. 의도 · 역할 · 종료 조건 (문서·프롬프트 우선, 코드는 점진)

| 필드 | 의미 |
|------|------|
| `intent` | 이번 턴/패킷의 목적 (짧은 기계 친화 라벨) |
| `role` | 하네스 내 역할 태그 (향후 planner / implementer 등) |
| `success_criteria` | 완료 판정에 쓸 한 줄 조건 (선택) |
| `escalation_rule` | 막혔을 때 COS·founder로 올리는 규칙 요약 (선택) |

초기에는 헌법·시스템 지시·패킷 메타에 자연어로만 있어도 되고, **필드명을 코드에 넣기 시작할 때 이 표를 따른다.**

## 4. 상태 · 권위

| 필드 | 의미 |
|------|------|
| `artifacts` | 실행 산출물 참조 (ledger 경로·요약) |
| `review_state` | 리뷰 큐·승인 상태 (있을 때) |
| `authority_state` | 콜백·권위 폐쇄 등 (예: authoritative callback closure) |

## 5. founder-facing vs internal audit

- **founder-facing:** Slack에 나가는 자연어, ledger 요약 한 줄, 금지어·헌법 준수.
- **internal audit:** `cos_run_events` / `cos_ops_smoke_events` / 요약 스트림 이벤트 타입 — 원시 비밀·전체 URL 금지 정책 유지.

두 축을 **한 저장소에 합치지 않는다** (에픽 2번·6번과 동일).

## 6. 다음 구현 순서 (이 문서 이후)

1. `run_id` / `thread_key` / `packet_id` 가 새 코드 경로에서 서로 치환되지 않게 리뷰 체크리스트로만 먼저 쓴다.  
2. ~~`COS_SLACK_APP_ID` 를 부트 truth에 노출(설정 시)~~ — 반영됨 (`cosRuntimeTruth` · `slack_app_id` 선택 필드).  
3. ~~테넄시 키를 cos_runs 쪽으로~~ — 반영됨 (`20260416130000_*`, `applyCosRunTenancyDefaults` / `appRunToDbRow`). **ledger 전 구간** 태깅은 여전히 후속(에픽 §다음 단계).  
4. 출시 점검: `COS_Release_Readiness_Checklist_2026-04-16.md`.  
5. 업그레이드 마일스톤(M0~M5, 테넄시·Slack·봉투·택배): `COS_Upgrade_Milestones_2026-04-16.md`.

## Owner actions

- 에픽 이슈에 `Phase 1` 라벨 + 이 파일 링크.  
- 필드 추가 시 이 문서를 한 단락만 수정해 SSOT 유지.
