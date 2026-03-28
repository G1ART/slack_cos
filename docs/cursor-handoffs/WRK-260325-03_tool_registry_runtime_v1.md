# WRK-260325-03 — 툴 레지스트리 런타임 v1

## 요약 (한국어)

위 Summary 와 동일: North Star **툴 레지스트리 v1** — 선언 필드 확장 + 런타임 관측 로그 + 조회 단일 진입 `invokePlanQueryTool` + 구조화 명령 진입 시 APR/디스패치 패밀리 표시.

## Summary

- `cosToolRegistry.js`: `pipeline` and `gate_policy` per tool.
- `cosToolTelemetry.js`: `tool_registry_bind` via `logRouterEvent`.
- `cosToolRuntime.js`: `invokePlanQueryTool`, `logStructuredCommandToolRegistry` (structured entry, observe-only gate log for high-risk prefixes).
- Wired: `queryOnlyRoute`, `runPlannerHardLockedBranch`, `runInboundAiRouter` (navigator, council), `runInboundStructuredCommands` (start).
- Test: `scripts/test-cos-tool-registry.mjs` in `npm test`.

## Next (v2)

LLM function calling and enforceable approval gates.

## Owner

- `npm test`
- Grep logs for `tool_registry_bind` and `tool_registry_gate`.
