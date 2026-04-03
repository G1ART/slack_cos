# Orchestration route policy (vNext.11)

## 목표

정적 “전 레인 항상 발사” 대신, **런 텍스트에서 뽑은 capability**와 **provider truth 스냅샷**으로 디스패치 후보를 계산한다.

## Capability taxonomy

`src/orchestration/runCapabilityExtractor.js`가 `project_goal`, `locked_mvp_summary`, includes/excludes에서 신호를 읽는다:

- `research` — 벤치/시장/경쟁사 등
- `fullstack_code` — 구현·코드·MVP 등 (research-only가 아닐 때)
- `db_schema` — Supabase/스키마/마이그레이션 등
- `uiux_design` — UI/UX/화면/인터랙션 등
- `deploy_preview` — 배포/프리뷰/Vercel/Railway 등 (trace; 실행 단계는 확장 여지)
- `qa_validation` — 코드/DB/UI/배포 표면이 있을 때 자동 포함

## Provider truth → 적격성

`src/orchestration/planExecutionRoutes.js`가 `buildProviderTruthSnapshot` 결과로 `route_decisions[]`를 만든다:

- **GitHub**: `live` 선호, 그 외 draft/manual_bridge 시 `fallback_used`
- **Cursor**: `live` → 라이브 산출; `manual_bridge` / `unavailable` → handoff·스킵 경로
- **Supabase**: `live` → apply 후보; `draft_only` / `not_configured` → 드래프트만

각 결정에 `capability`, `selected_agent`, `selected_provider`, `preconditions_passed`, `fallback_used`, `rationale`, `produced_artifacts`를 둔다.

## 실행 계층

- **Planner**: `planExecutionRoutesForRun` + `extractRunCapabilities`
- **Executor**: `dispatchOutboundActionsForRun` — planner가 켠 capability에 대응하는 레인만 `generateResearchArtifact` / `generateUiuxArtifacts` / `generateQaArtifacts` / GitHub·Cursor·Supabase 호출

## 카탈로그

`src/orchestration/cosCapabilityCatalog.js` — capability ↔ agent ↔ provider 매핑(설명·확장용; 판정 정본은 extractor + planExecutionRoutes).

## 남은 리스크

- `deploy_preview`에 대한 실제 Vercel/Railway 아웃바운드는 어댑터 연결 시점에 맞춰 executor에 편입 필요.
- `dispatchWorkstream`은 레거시로 fullstack_swe 시 supabase까지 묶일 수 있음 — 전체 런 디스패치는 `dispatchOutboundActionsForRun`을 정본으로 둔다.
