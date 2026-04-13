# 택배사무소 관측 — primary / advisory 페이즈 & 감사 strict (2026-04-12)

정본: `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md`.

## 요약 CLI

`scripts/summarize-ops-smoke-sessions.mjs` 출력에 `primary_phases_seen` / `advisory_phases_seen` 추가.  
`advisory`는 GitHub 부차 증거·비권위 지문 등(`opsSmokeParcelGate.js` 의 `PARCEL_ADVISORY_DISPLAY_PHASES`).

## 감사

`npm run audit:parcel-health -- --strict --strict-warnings-only` — **하드 `warnings`만** exit 1, 스트림 고아 비율 `advisory`는 CI에서 무시 가능.

## 코드

- `src/founder/opsSmokeParcelGate.js` — `partitionPhasesSeenForParcelDisplay`
- `src/founder/smokeOps.js` — 세션 요약에 필드 전파
- `scripts/audit-parcel-ops-smoke-health.mjs`

## Owner actions

- `npm run verify:parcel-post-office`, `npm test`
