# W11 Internal Alpha Qualification & Live Rehearsal
# Baseline: 49f6924
# Purpose: convert W8–W10 from strong architecture into founder-grade internal-alpha proof
# Non-goal: do not reopen founder surface, callback core, or broad workflow-engine logic

## 0) What this step is

W8–W10 established:
- failure taxonomy + HIL envelope
- project-space binding graph store
- env/secret propagation plan/engine
- human-gate continuation runtime
- delivery readiness
- live scenario proof harness
- proactive signals / draft surface
- tool-lane qualification
- harness proof scorecard

W11 is **not** another abstraction layer.
W11 is a **live qualification epic**.

The objective is to answer these questions with evidence:
1. Can a real project-space accumulate correct repo/deploy/db/env bindings without cross-project contamination?
2. When automation cannot proceed, does COS expose the correct human gate and resume after founder action?
3. Are failures classified honestly (HIL vs missing capability vs runtime regression vs provider transient)?
4. Do live/bounded rehearsals produce trustworthy delivery-readiness and scenario-proof outputs?

## 1) Hard scope

### In scope
- live-binding writer capability matrix tightening
- delivery-readiness audit CLI
- human-gate resume truth and auditability tightening
- one bounded live rehearsal path for scenario 1
- one bounded live rehearsal path for scenario 2
- proof artifacts for where automation stops and why

### Explicitly out of scope
- no new founder-facing broad UX redesign
- no broad proactive auto-send path
- no callback/parcel-office core refactor
- no public distribution / marketplace packaging
- no OCR / PDF deep extraction work
- no “workflow engine” that hardcodes COS↔Harness ordering

## 2) Product requirement for W11

The system must not merely “appear to run.”
It must make the following visible and auditable:
- what was attempted automatically
- what succeeded automatically
- what failed automatically
- why it failed
- whether the failure requires HIL or code/product follow-up
- where automation can resume after HIL completion

## 3) Primary gaps to close in W11

### G11-A — live writer capability ambiguity
Current plan/engine is useful, but capability assumptions remain too coarse.
A sink should not be marked uniformly “smoke-only” when the official platform allows stronger verification.

Need:
- one explicit capability registry per sink
- split between:
  - can_write
  - can_verify_existence
  - can_read_back_value
  - requires_manual_confirmation
- this must be separate from founder messaging

### G11-B — delivery readiness lacks operator-grade audit
Current delivery readiness exists, but internal alpha needs a dedicated audit entrypoint.

Need:
- `audit:delivery-readiness`
- concise per-project-space readiness report
- explicit blockers and human gates
- no secret values in output

### G11-C — human-gate resumption needs stronger traceability
Current human-gate runtime exists, but internal alpha should prove that a founder action can resume automation cleanly.

Need:
- open/closed/resumed timestamps and resumer identity/source
- explicit continuation pointer (which plan/run/step resumes next)
- audit output that proves resumability

### G11-D — scenario live proof is still too narrow
Current live runner is useful but still limited.
Internal alpha should run a bounded, real lane rehearsal rather than fixture-only confidence.

Need:
- scenario 1 bounded live rehearsal
- scenario 2 bounded live rehearsal
- both must write proof envelopes showing break location / resolution class / continuation availability

### G11-E — tool qualification and propagation truth are not yet joined enough
Tool-lane qualification and delivery readiness should converge on the same truth in audits.

Need:
- readiness audit must consume:
  - project-space binding graph
  - propagation runs/steps
  - human gates
  - tool-lane qualification summary
  - delivery readiness

## 4) File-level implementation targets

### A. Capability registry
Create:
- `src/founder/liveBindingCapabilityRegistry.js`

Purpose:
- SSOT for sink capabilities used by propagation planning and audits

Expected shape per sink:
- `can_write`
- `can_verify_existence`
- `can_read_back_value`
- `verification_modes_supported`
- `requires_manual_confirmation`
- `notes`

This module should replace ad hoc inline capability assumptions in:
- `src/founder/envSecretPropagationPlan.js`
- `src/founder/envSecretPropagationEngine.js`

### B. Delivery readiness audit
Create:
- `scripts/audit-delivery-readiness.mjs`

Read from existing truth only:
- `projectSpaceBindingStore`
- propagation runs/steps
- human gate runtime
- tool lane qualification
- delivery readiness

Outputs:
- human-readable compact lines
- optional JSON mode
- no secrets
- one project-space at a time, plus optional “all recent” mode

Add npm script:
- `audit:delivery-readiness`

### C. Human-gate continuation tightening
Modify:
- `src/founder/humanGateRuntime.js`
- `src/founder/projectSpaceBindingStore.js`
- related Supabase persistence files if needed

Add / guarantee fields:
- `continuation_key`
- `resume_target_kind`
- `resume_target_ref`
- `reopened_count`
- `last_resumed_at`
- `last_resumed_by`

Important:
- no workflow engine sequencing
- only continuation truth + auditability

### D. Propagation run auditability
Modify:
- `src/founder/envSecretPropagationEngine.js`
- relevant persistence files / migration follow-up only if truly necessary

Need:
- propagation run result should explicitly expose:
  - attempted steps
  - completed steps
  - blocked steps
  - verification mode used
  - whether the run is resumable
  - next human action if any

### E. Scenario live rehearsal tightening
Modify:
- `src/founder/scenarioProofLiveRunner.js`
- `scripts/scenario/run-scenario-1-multi-project-spinup.mjs`
- `scripts/scenario/run-scenario-2-research-to-bundle.mjs`
- `src/founder/scenarioProofResultClassifier.js`
- `src/founder/scenarioProofScorecard.js`

Need:
- bounded live mode that uses real lane truth when enabled
- if a required lane is not safely configured, return `inconclusive` with honest reason
- break location must distinguish:
  - binding propagation stop
  - external auth gate
  - subscription/billing gate
  - provider transient failure
  - product capability missing
  - runtime regression

### F. Read-model exposure for audits only
Modify lightly:
- `src/founder/executionContextReadModel.js`
- `src/founder/founderCosToolHandlers.js`

Need:
- do not bloat founder surface
- only expose extra slices needed for audits and internal review, not broad founder prose

## 5) Test plan

Add/upgrade tests for the following:

### Capability registry
- sink capability rows are explicit and deterministic
- planning uses registry instead of inline defaults
- no sink is silently assumed writable/verifiable without registry entry

### Delivery readiness audit
- readiness lines do not leak secret values
- blocked binding + human gate shows up in audit
- successful smoke-only path is distinguished from stronger verified path

### Human-gate continuation
- opening a gate records continuation pointer
- resuming a gate updates timestamps and preserves traceability
- resumed flow does not lose project-space identity

### Scenario live proof
- live mode with insufficient config returns honest `inconclusive`
- break_location is correctly classified
- continuation_available is true only when a real continuation path exists

### Cross-project contamination
- two project spaces in same workspace do not mix bindings, human gates, or readiness outputs

## 6) Manual rehearsal protocol after code lands

Run in this order:
1. `npm test`
2. `npm run audit:delivery-readiness -- --json`
3. `npm run scenario:proof:live -- --scenario scenario_1_multi_project_spinup`
4. `npm run scenario:proof:live -- --scenario scenario_2_research_to_bundle`
5. one founder-side live turn to confirm no new jargon leakage in founder-facing output

## 7) Success criteria

W11 is done only if:
- delivery readiness can be audited per project-space without reading raw DB rows
- live propagation failures are classified honestly
- human-gate resumption is traceable and resumable
- bounded live scenario rehearsals produce proof envelopes with honest break points
- no new founder-facing internal token leakage appears
- no broad proactive auto-send path is introduced

## 8) Closeout report format

1. Implemented files changed/added
2. Capability registry summary by sink
3. Delivery-readiness audit output example
4. Scenario 1 live rehearsal result
5. Scenario 2 live rehearsal result
6. Human-gate continuation example
7. Remaining hard HIL points
8. Next recommendation (W12)

## 9) W12 preview (do not implement now)

If W11 closes successfully, W12 should focus on:
- narrow proactive COS actuation from audited signals
- harness quality benchmark harness beyond scorecard rollups
- beta packaging / installation kit only after internal alpha passes
