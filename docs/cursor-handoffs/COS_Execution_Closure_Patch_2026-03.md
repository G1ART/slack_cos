# COS Execution Closure Patch — 2026-03-29

## Patch Summary

**Title**: Execution Closure — auto-dispatch outbound, ingest results back into run, and make GitHub/Cursor/Supabase actually operational

**Mission**: Turn outbound orchestration from "structural seed" into "operational execution spine". After this patch:
1. `execution_run` auto-dispatches outbound work once on creation
2. Outbound results can be ingested back into the same run
3. GitHub/Cursor/Supabase statuses are truthful and traceable
4. Research/UIUX/QA artifacts are actually generated files, not just path placeholders
5. Representative-facing execution reporting shows real PM-level truth
6. Retries work without duplication
7. No council leak during any closure flow

---

## Architecture: Execution Lifecycle

```
execution_run created (3 trigger sites)
    ↓
dispatchOutboundActionsForRun() [fire-and-forget, idempotent]
    ↓
┌─ generateResearchArtifact()     → docs/research-notes/*.md
├─ generateUiuxArtifacts()        → docs/design-specs/*.md (×3)
├─ generateQaArtifacts()          → docs/qa-specs/*.md (×3)
├─ ensureGithubIssueForRun()      → live issue OR draft payload
├─ ensureCursorHandoffForRun()    → docs/cursor-handoffs/*.md
└─ ensureSupabaseDraftForRun()    → data/supabase-drafts/*.json (if DB implied)
    ↓
All artifacts → run.artifacts + lane outbound metadata
    ↓
[External tools execute]
    ↓
ingestGithubResult(runId, payload)
ingestCursorResult(runId, payload)     ← file-drop: data/cursor-results/{runId}.json
ingestSupabaseResult(runId, payload)
    ↓
run.artifacts + traces updated
    ↓
representative-facing reporting shows truthful PM status
```

## Auto-Dispatch Trigger Points

Three canonical locations where `createExecutionRun()` is called, each followed by auto-dispatch:

1. **`runInboundAiRouter.js`** — playbook → execution promotion ("진행해줘")
2. **`startProjectLockConfirmed.js`** — scope lock confirmed
3. **`projectSpecSession.js`** — spec sufficiency → execution

Dispatch is fire-and-forget with `.catch()`. Errors are handled per-lane without collapsing run ownership.

## Idempotency

- `run.outbound_dispatch_state`: `not_started` → `in_progress` → `completed` | `partial` | `failed`
- `dispatchOutboundActionsForRun()` returns `{ skipped: true }` if state is `completed`
- `ensureGithubIssueForRun()` checks `artifacts.fullstack_swe.github_issue_id || github_draft_payload`
- `ensureCursorHandoffForRun()` checks `artifacts.fullstack_swe.cursor_handoff_path`

## Result Ingestion Contract

### `executionResultIngestion.js`

| Function | Updates |
|---|---|
| `ingestGithubResult(runId, payload)` | artifacts, git_trace, lane outbound |
| `ingestCursorResult(runId, payload)` | artifacts, cursor_trace, lane outbound, latest_report |
| `ingestCursorResultFromFile(runId)` | Scans `data/cursor-results/` and `docs/cursor-results/` |
| `ingestSupabaseResult(runId, payload)` | artifacts, supabase_trace, lane outbound, git_trace.supabase_migration_ids |

### Cursor File-Drop Convention

Drop result at: `data/cursor-results/{RUN-xxxxx}.json`

```json
{
  "result_summary": "...",
  "changed_files": ["src/..."],
  "tests_passed": true,
  "status": "completed"
}
```

### Supabase Apply Status Model

- `draft_only` → outbound: `drafted`
- `manual_apply` → outbound: `manual_required`
- `applied_result_ingested` → outbound: `completed`
- `failed` → outbound: `failed`

## Retry/Recovery

- `retryOutboundLane(runId, laneType)` — resets lane and re-dispatches
- `retryRunOutbound(runId)` — retries all non-completed/non-dispatched lanes
- Idempotent: already-dispatched/completed lanes are skipped

## Real Artifact Generation

All lanes now generate actual files on disk:

| Lane | Artifacts |
|---|---|
| `research_benchmark` | `docs/research-notes/research_*.md` |
| `uiux_design` | `docs/design-specs/uiux_*_spec.md`, `*_components.md`, `*_wireframe.md` |
| `qa_qc` | `docs/qa-specs/qa_*_acceptance.md`, `*_regression.md`, `*_smoke.md` |
| `fullstack_swe` | GitHub issue/draft, Cursor handoff, optional Supabase draft |

## Execution Reporting (PM Surface)

The reporting renderer now shows:
- Dispatch state (`not_started` / `in_progress` / `completed` / `partial`)
- Per-lane status with icons, provider, ref IDs, errors
- Git trace (repo, issue, branch, PR, cursor handoff, supabase migrations)
- Cursor trace summary (entry count, latest status, result summary)
- Supabase trace summary (entry count, latest migration ID)
- Manual action required section for blocked/failed/manual_required lanes

## ENV Requirements

| Variable | Purpose | Required? |
|---|---|---|
| `GITHUB_FINE_GRAINED_PAT` or `GITHUB_TOKEN` | Live GitHub issue creation | Optional (draft mode fallback) |
| `GITHUB_DEFAULT_OWNER` + `GITHUB_DEFAULT_REPO` | Target repo | Optional |
| No Supabase env needed for draft | Draft generation only | — |

## Tests

10 new regression tests in `scripts/test-execution-closure.mjs`:

1. dispatch exactly once + idempotency
2. progress does not duplicate outbound
3. github status persists
4. cursor result ingestion
5. supabase result ingestion
6. real artifact generation (7 files)
7. retry without duplication
8. no council leak in closure flows
9. partial failure keeps ownership truthful
10. manual_required stays explicit

## Next Patch Priorities

1. **Cursor cloud callback** — replace file-drop with real webhook/callback when Cursor API supports it
2. **Supabase live apply** — add `supabase db push` integration when configured
3. **GitHub PR auto-creation** — create PR after branch push detected
4. **Lane dependency chain** — research_benchmark → fullstack_swe → qa_qc sequential dispatch
5. **Execution completion detection** — auto-transition to `execution_reporting` when all lanes completed
6. **Representative-facing progress notification** — proactive Slack message on lane completion

---

## Owner Actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
node scripts/test-execution-closure.mjs
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "Execution Closure: auto-dispatch, result ingestion, real artifacts, retry, PM reporting"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
