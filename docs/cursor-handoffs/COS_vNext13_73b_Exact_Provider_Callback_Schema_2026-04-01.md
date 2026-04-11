# vNext.13.73b — Exact provider callback schema lock + callback source default

## Purpose

Lock the **exact Cursor Cloud provider completion payload** (fixture: `scripts/fixtures/cursor-exact-provider-callback-v13-73.json`) as the canonical correlation + progression contract: `accepted_external_id` / `external_run_id` / `context.thread_key` / `context.packet_id` precedence, `backgroundComposerId` as **external run id alias only** (never accepted id), `accepted_and_applied` → `positive_terminal`, signed webhooks without internal probe headers default to **`provider_runtime`** (not `unknown`).

## Code touchpoints

| Area | File | Notes |
|------|------|--------|
| Field precedence | `cursorWebhookIngress.js` | Canonical root/context fields before env dot-paths; `paths_touched` prefers root. |
| Status bucket | `externalRunStatus.js` | `accepted_and_applied`, `applied`, … → `positive_terminal`. |
| Source kind | `cursorCallbackTruth.js` | Non–probe header values → `provider_runtime`. |
| Meta default | `canonicalExternalEvent.js` | Missing `callback_source_kind` → `provider_runtime`. |
| Stale blocked | `runSupervisor.js` | Skip blocked founder milestone when cloud emit_patch + provider structural closure already recorded. |
| Ingress return | `externalEventGateway.js` | Optional `canonical_status` on matched Cursor callbacks. |

## Tests

- `scripts/test-v13-73-exact-provider-callback-schema.mjs` — exact fixture, synthetic progression denial, env override guard, synthetic-then-provider upgrade.
- `scripts/test-v13-73-authoritative-callback-closure.mjs` — §5: arbitrary non-probe header still progresses.
- `scripts/test-cursor-webhook-canonicalization.mjs` — composer-only payload: `external_run_id` = composer, accepted hint null.
- `scripts/test-external-event-correlation.mjs` — composer webhook matches `cloud_agent_run` row.

## SQL

없음.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.73b: exact provider callback schema lock and provider default source"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
