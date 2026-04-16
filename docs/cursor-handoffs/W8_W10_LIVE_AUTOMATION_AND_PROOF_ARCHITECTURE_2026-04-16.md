# W8–W10 Live Automation, Human-Gate, and Proof Architecture

## Baseline
Latest reviewed main: `d1d7280`

## Goal
Move the product from a strong orchestration kernel with proof/instrumentation slices into a genuinely deployable Slack automation OS that:
- actually drives multi-project build work,
- actually propagates bindings and environment state across tools,
- explicitly escalates only the human-required gates,
- and makes live breakpoints visible as product truth instead of hiding them behind optimistic prose.

## Product truth
The product is not “AI that appears to manage projects.”
It is “COS as the single founder interface, Harness as the internal workcell, and external tools as execution lanes, with real closure, auditable truth, and explicit human gates.”

## What is already strong
- Founder-only COS surface
- Tool-plane boundary and packet/callback spine
- Persona contract envelope
- Minimal workcell runtime
- Truth shell + tenancy fail-closed + read model
- Founder surface layer
- Failure taxonomy, project-space binding store skeleton, scenario proof envelope, proactive signal roll-up, tool-lane qualification

## What is still missing
### 1. Binding graph exists as storage skeleton, not as live propagation engine
The product can now store project-space bindings and human gates, but it does not yet reliably:
- collect source values,
- classify them as secret/write-only/readable,
- propagate them to tool sinks,
- verify application,
- reopen automation after gate resolution.

### 2. Human gates are classified, but not yet resumable automation checkpoints
The product can name a gate but cannot yet treat it as a resumable execution boundary with:
- a pending founder action,
- a completion detector,
- and a continuation target.

### 3. Scenario proof remains mostly fixture/in-memory
The product can describe where things break, but it still needs live-mode dry runs that prove the breakpoints and resolution classes against real adapters and real credentials.

### 4. Proactive COS is observable but not yet productized as action
Signals are computed and exposed in read context, but there is not yet a tightly bounded operational rule-set that turns them into founder-visible escalations within the existing single send path.

### 5. Harness proof is instrumentation-first, not quality-proof-first
The product records more internal evidence now, but it still does not prove that Harness materially improves execution quality, rework quality, or completion reliability.

## Hard boundary: what code must do vs what AI must do
### Code must do
- maintain project-space identity and binding truth
- carry source/sink/env requirements
- classify failures and human gates
- propagate values where APIs permit
- record what was written where
- verify that deployment/runtime picked the values up
- resume automation once a gate is resolved
- expose breakpoints and resolution classes as truth

### AI must do
- decide what sequence to pursue
- decide what can run in parallel
- decide when to retry vs escalate
- explain the plan and the blockage in natural Korean
- allocate Harness roles and reviews
- interpret operator intent and trade-offs

## Technical feasibility map
### Automatable now with current tool support
- GitHub repo creation, contents writes, webhooks, secrets, environments
- Vercel project creation, env creation/update, deployment triggering
- Railway project/service variables via Public API
- Supabase project/org management via OAuth + Management API
- Slack app manifests, installation reuse, HTTP/Socket event handling
- Cursor Cloud webhook/event surfaces and environment/secrets setup patterns

### Still human-gated in normal operation
- first admin consent / OAuth approval
- org policy approvals
- billing/subscription upgrades
- privileged portal actions without public API
- trust/legal decisions

### Important caveat
Some systems are write-only or effectively write-only for secrets.
Therefore the product must model:
- source-of-truth value capture,
- write-only sink writes,
- read-back verification where supported,
- and smoke verification where read-back is unavailable.

## Refined gap priority
### P0 — Live env/secret propagation and resumable human gates
Highest priority. This is the main “real vs fake” boundary.

### P1 — Project-space binding graph as execution object
The system must know what is bound to what, and what is missing.

### P2 — Live scenario proof harness
Need real dry-runs, not only fixture proof.

### P3 — Proactive COS operational actuation
Signals must become bounded operational reporting through the single founder send path.

### P4 — Harness quality proof
Needed especially before external customers and broader scaling.

## Recommended next roadmap
### W8 — Live Binding & Propagation Core
Build the actual execution substrate for project-space bindings, env/secret propagation, and resumable human gates.

#### Scope
- project-space binding graph runtime
- binding requirement model
- env/secret propagation plan and execution engine
- human gate runtime with resumable continuation
- adapter-side binding writers for GitHub/Vercel/Railway/Supabase where officially supported
- smoke verification and delivery readiness

#### Non-goals
- full public distribution packaging
- Marketplace packaging
- OCR/PDF advanced extraction
- expanding founder surface again
- re-opening callback core

#### Required entities
- `project_space`
- `binding_graph`
- `binding_requirement`
- `propagation_run`
- `human_gate`
- `delivery_readiness`

#### Required field ideas
- binding kind
- source system
- sink system
- secret handling mode: `plain_readable | write_only | smoke_only`
- last propagated at
- last verification result
- required human action
- continuation target packet/run

#### Candidate file set
- `src/founder/projectSpaceBindingGraph.js`
- `src/founder/bindingRequirements.js`
- `src/founder/envSecretPropagationPlan.js`
- `src/founder/envSecretPropagationEngine.js`
- `src/founder/humanGateRuntime.js`
- `src/founder/deliveryReadiness.js`
- `src/founder/toolPlane/lanes/github/githubBindingWriter.js`
- `src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js`
- `src/founder/toolPlane/lanes/railway/railwayBindingWriter.js`
- `src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js`

#### Required truth exposure
`read_execution_context` should gain a compact slice for:
- active project-space bindings
- unresolved human gates
- delivery readiness summary
- last propagation failures with resolution class

### W9 — Live Scenario Proof Harness
Turn scenario proof into live dry-run proof against real tool lanes.

#### Scope
- live-mode scenario runner for Scenario 1 and 2
- real adapter dry-runs with bounded side effects
- break_location + resolution_class proof output
- success/failure scorecard

#### Candidate files
- `src/founder/scenarioProofLiveRunner.js`
- `src/founder/scenarioProofResultClassifier.js`
- `src/founder/scenarioProofScorecard.js`
- `scripts/run-scenario-proof-live.mjs`

#### Output must show
- where execution broke
- whether it was HIL-required or implementation-missing
- whether the break was adapter/policy/model/runtime related
- whether a continuation path existed

### W10 — Proactive COS Operations + Harness Quality Proof
Make the system behave like an operator, and prove that Harness helps.

#### Scope
- bounded proactive operational reports via existing founder send path
- stalled-run and unresolved-gate triggers
- Harness proof score lines / acceptance evidence roll-up
- rework and reviewer-value metrics

#### Candidate files
- `src/founder/proactiveSurfacePolicy.js`
- `src/founder/proactiveTurnPlanner.js`
- `src/founder/harnessProofScorecard.js`
- `scripts/audit-harness-proof.mjs`

#### Important constraint
No new founder send path. Reuse the existing single founder response path only.

## Benchmarking takeaways to import
### OpenHands
Separate runtime from evaluation. Benchmark harnesses are a first-class artifact, not an afterthought.

### Composio Agent Orchestrator
Strong git isolation and human-only-when-needed posture are valuable patterns.

### Lovable
GitHub ownership/export/self-host posture is useful, but it is not itself multi-project orchestration. Do not mistake export/deploy convenience for execution-OS capability.

## Exit criteria for “real product” confidence
The product becomes genuinely recommendable when:
1. a new project can be opened,
2. required bindings are created or classified,
3. env/secret propagation happens where APIs allow it,
4. human gates are escalated only where necessary,
5. automation resumes after gate completion,
6. live dry-run scenarios show breakpoints truthfully,
7. founder sees concise Korean operational updates,
8. and every break carries a resolution class.

## Recommended immediate action
Use this as the new plan-mode master context for the next core epic.
The next implementation epic should be **W8 Live Binding & Propagation Core**.
