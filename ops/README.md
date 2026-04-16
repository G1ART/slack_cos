# Ops 산출물

- `preflight_manifest/` — `scripts/preflight_required_docs.mjs` 가 생성하는 청크·sha256 매니페스트 (`*.json` 은 기본 gitignore).
- `preflight_ack/` — 동일 청크에 대한 인지(요약) 아티팩트 (`*.json` 은 기본 gitignore).

워크플로: 마스터 인스트럭션 W0 — `npm run preflight:required-docs` → 템플릿 작성/편집 → `npm run verify:preflight-ack`.
