# W5–W7 Core Product Gap Analysis + Mitigation Architecture + Proof Roadmap

Date: 2026-04-16  
Project: `slack_cos`  
Baseline: latest reviewed main after W4 closeout (`0ba1d02`)  
Purpose: lock the remaining core-product build path from “usable orchestration kernel” to “provable founder-grade Slack operating system” without drifting into fake automation, workflow-engine overreach, or commercialization-side packaging work.

---

## 0) What this document is and is not

This document is:
- a **core product roadmap** for the remaining W5–W7 stretch,
- a **gap analysis** rooted in the current codebase and the founder’s real scenario requirements,
- a **mitigation architecture** that distinguishes what AI should decide vs what code must guarantee,
- a **proof roadmap** focused on exposing where the system truly works, where it breaks, and why.

This document is **not**:
- a deployment-packaging plan,
- a customer-dedicated installation plan,
- a Marketplace/commercialization doc,
- a promise that everything can or should become fully automatic.

Commercial packaging / customer-dedicated deployment / BYO keys / install replication are important, but they are **outside this W5–W7 core product document**.

---

## 1) Product truth to preserve

The product we are building remains:

> A founder speaks naturally to one COS in Slack.  
> Behind that interface, Harness AI members and external tools operate continuously using shared run / packet / project-space language.  
> Work actually gets done.  
> State actually closes.  
> Failure reason is explicit.  
> Audit and truth remain queryable.  
> Human-in-loop appears only where truly required.

### Preserve these architectural truths

1. **Founder sees COS only**.
2. **Harness is not a keyword router or toy multi-prompt system**.
3. **Code does not replace judgment**.
4. **Code must guarantee boundaries** where wrong execution would be dangerous or misleading.
5. **Surface polish must never fake progress or completion**.
6. **Project-space truth matters as much as run truth**.
7. **The system must reveal where it breaks** instead of pretending the scenario worked.

---

## 2) Current state after W0–W4

### What is already real

These pieces now exist in main and should be treated as real infrastructure, not hypothetical plans:

- Required-doc start gate and preflight verification.
- Thin founder orchestrator / tool loop boundary.
- Tool-plane lane separation.
- Persona contract manifest and contract validation.
- Minimal Harness workcell runtime.
- Active run shell / execution context shell.
- Tenancy fail-closed on critical durable paths.
- Centralized execution context read model.
- Founder-facing surface layer with truth-first rendering.
- Parcel-office / callback closure spine as working infrastructure.

### What is still not proven enough

Even with the above in place, the following are still not sufficiently proven:

- that Harness is truly a productive internal AI team rather than a packetized delegation shell,
- that COS↔Harness produces a real organic work loop,
- that multi-project orchestration remains traceable when external tools are actively used,
- that failures reveal whether the cause is HIL-required, policy-bound, missing capability, runtime bug, or coordination failure,
- that scenario 1 and scenario 2 can be run end-to-end in a way that exposes real gaps instead of hiding them.

That is why W5–W7 must be about **proof, exposure, and orchestration reality**, not cosmetic feature count.

---

## 3) Clarifying the most important philosophical boundary

The remaining work only stays aligned if the following distinction is kept hard.

### AI layer should decide

AI should decide:
- how to sequence work,
- when to parallelize,
- whether to write code vs write a stronger instruction set,
- when to retry or reformulate,
- when to escalate,
- how to explain tradeoffs,
- how to balance quality / speed / cost.

### Code layer must guarantee

Code must guarantee:
- run / thread / tenant / project-space identity,
- binding truth across repo / deploy / db / env / delivery objects,
- authoritative callback closure semantics,
- allowed tool / action safety boundaries,
- result envelope validity,
- failure classification and auditability,
- human-in-loop gates when truly required,
- founder-facing truth not drifting away from actual execution truth.

### What code must not do

Code must **not**:
- force a rigid workflow-engine sequence for COS↔Harness collaboration,
- decide that “scope is mature enough” before the AI does,
- over-police founder language,
- hardcode an employer/employee-style management protocol,
- fake completions or artifacts to make the system look impressive.

The correct design is:

> **Soft judgment, hard boundaries.**

---

## 4) Reframed gap analysis (post-W4)

This is a **parallel gap list**.  
It is not a hierarchy.  
It is not strict sequencing.  
It is not a waterfall.

### G1. Failure taxonomy / HIL boundary gap

Current issue:
- blocked / failed / review_required / escalated states exist,
- but the system still does not provide a globally consistent reason taxonomy that tells the founder whether the break is due to:
  - external auth,
  - billing/subscription,
  - policy/product decision,
  - missing feature,
  - runtime bug,
  - provider failure,
  - model coordination failure,
  - tenancy or binding ambiguity.

Why this matters:
- without this, the tool can appear to “run” while still hiding where it actually failed.
- this is the line between a fake demo and a real operating system.

### G2. Project-space binding graph gap

Current issue:
- run truth and tenancy truth exist,
- but project-space-level bindings across repo / deploy / db / env / cursor root / human gate are not yet first-class, durable, queryable objects.

Why this matters:
- AI may reason flexibly, but if the system does not persist what project assets are bound to which project space, multi-project operation will eventually drift or cross-contaminate.

### G3. Scenario proof harness gap

Current issue:
- the repo has many regression tests,
- but it still lacks explicit end-to-end benchmark harnesses for the founder’s real scenarios.

Why this matters:
- the product must prove where the scenario succeeds, where it breaks, and why.
- otherwise it will only appear to work through good narrative.

### G4. Proactive COS operations gap

Current issue:
- founder-facing surface is stronger,
- but the system is still weak at proactively surfacing blockers, stale runs, required decisions, and next actions without being asked.

Why this matters:
- founder experience becomes truly valuable only when COS behaves like an operating chief of staff, not only a responsive assistant.

### G5. Harness capability proof gap

Current issue:
- Harness now has persona contracts, workcell runtime, and packet-level validation,
- but there is not yet strong proof that the internal team behavior actually improves outcome quality rather than merely structuring it.

Why this matters:
- for internal use this may be tolerable for a while,
- for external product trust or future commercialization it becomes critical.

---

## 5) Priority interpretation

The founder’s practical priority weighting is approximately correct:

- **Most important now:** G1 and G2
- **Very important:** G3 and G4
- **Important, but slightly later proof-oriented:** G5

My refined interpretation:

- **G1 + G2** are core product truth gaps.
- **G3 + G4** are product proof and founder-operations gaps.
- **G5** is a capability proof gap that becomes increasingly important as the product is used more heavily and especially before external customer trust is expected.

---

## 6) What is technically possible today vs what remains inherently HIL

This section matters because the roadmap must distinguish:
- things we have not built yet,
- things current external platforms actually support,
- things that remain realistically human-gated.

### 6.1 Slack

Slack supports:
- app manifests,
- OAuth distribution,
- Socket Mode,
- Events API,
- file objects and private download URLs,
- workflow/event triggers for app behavior.

Implication:
- Slack does **not** block a serious internal orchestration OS.
- Slack is sufficient for founder/COS interface, event intake, file intake, and app distribution in internal or customer-dedicated contexts.

Constraint:
- some distribution models and public Marketplace paths have policy constraints.
- that is **not** a core product blocker.

### 6.2 GitHub

GitHub supports:
- repo creation and management,
- branches, PRs, webhooks,
- app installations,
- secrets and Actions integration.

Implication:
- repo creation, branch isolation, webhook traceability, and PR-based delivery are technically feasible.
- this is not blocked by GitHub capability.

Typical HIL boundary:
- org permissions,
- repo creation authorization,
- security/policy decisions.

### 6.3 Supabase

Supabase supports:
- Management API,
- project operations,
- OAuth/integration scopes,
- admin/project configuration through API paths.

Implication:
- project-specific DB lifecycle and binding truth are technically feasible.
- the problem is not API absence; it is our current lack of project-space binding graph and HIL boundary modeling.

Typical HIL boundary:
- billing / plan,
- org-level permissions,
- manual approval of integration.

### 6.4 Vercel / Railway

Both platforms support:
- project/service creation,
- env var management,
- deployments through API or platform primitives.

Implication:
- deploy binding truth and delivery status are technically feasible.
- again, the missing piece is not raw capability but orchestration truth.

Typical HIL boundary:
- org access,
- billing,
- account policy,
- domain / infra ownership decisions.

### 6.5 Cursor / coding-agent automation layer

Current tooling supports webhook/event-oriented automation and callback-driven flows.

Implication:
- coding-agent execution and callback-based closure are technically feasible.
- we already have working parcel-office infrastructure.
- the remaining gap is not whether callback closure can happen, but whether the system can bind that execution to project-space delivery truth in a scalable way.

### 6.6 What remains inherently HIL today

Even after W5–W7, some areas will still legitimately require human-in-loop:

- first-time OAuth/integration authorization,
- billing / subscription activation,
- org policy approvals,
- manual portal submission when no safe API exists,
- high-risk product or legal decisions,
- security-sensitive secret handling in some organizations.

This is acceptable.
The product goal is not “zero HIL no matter what.”
The goal is:

> **Expose exactly where HIL is truly required, and eliminate HIL everywhere else.**

---

## 7) Benchmarking / design lessons from adjacent tools

### Lovable

What it proves:
- users value AI-assisted building that still preserves code ownership, deployment control, and exportability.

What we should take:
- strong ownership / binding truth principles,
- not pretending the platform itself becomes the whole operating system.

What we should not copy:
- a UX that is mainly “describe and generate.”
- our product is more executional and stateful than that.

### OpenHands

What it proves:
- it is useful to separate the execution engine from the evaluation harness.

What we should take:
- scenario benchmark harnesses should be first-class,
- proof of capability should not live only in runtime narrative.

### Agent-orchestrator / similar engineering-oriented agent systems

What they show:
- branch/worktree/PR isolation and explicit human-judgment gates are powerful ways to prevent task collision.

What we should take:
- project-space and work-output isolation must be explicit,
- “human only when judgment is required” is the correct gate philosophy.

### Important takeaway

None of these systems invalidate the founder’s philosophy.
If anything, they support it:
- AI should do the reasoning,
- code should preserve truth, boundaries, isolation, and auditability.

---

## 8) Mitigation architecture for the remaining core product

This is the architecture I recommend for the W5–W7 stretch.

### Track A — Failure taxonomy and human-gate model

Introduce first-class structured fields such as:
- `resolution_class`
- `human_gate_required`
- `human_gate_reason`
- `human_gate_action`
- `retryable`
- `retry_budget_remaining`

Allowed `resolution_class` examples:
- `hil_required_external_auth`
- `hil_required_subscription_or_billing`
- `hil_required_policy_or_product_decision`
- `technical_capability_missing`
- `runtime_bug_or_regression`
- `provider_transient_failure`
- `model_coordination_failure`
- `tenancy_or_binding_ambiguity`

Purpose:
- make failures legible,
- expose what patching can fix vs what only human action can unblock,
- prevent false “done” impressions.

### Track B — Project-space binding graph

Introduce a first-class persistent model for:
- `project_space`
- `spinup_run`
- `binding_graph`
  - repo binding
  - default branch
  - cursor root / spec binding
  - db binding
  - deploy binding
  - env requirement set
- `human_gate_status`
- `delivery_readiness`

Purpose:
- let AI reason freely while code preserves which external assets belong to which project space,
- prevent cross-project confusion,
- support traceable escalation/direction loops.

### Track C — Scenario proof harness

Introduce a benchmark harness that runs scenario 1 and scenario 2 end-to-end and emits:
- success/failure,
- break location,
- `resolution_class`,
- HIL requirement,
- cross-project contamination detection,
- artifact/delivery completeness.

Purpose:
- prove real execution,
- expose fake automation,
- generate product truth rather than anecdotal optimism.

### Track D — Proactive COS operations layer

Introduce structured triggers for:
- stale run detection,
- unresolved escalation detection,
- missing binding detection,
- delivery-ready notification,
- human gate required notification,
- multi-project health summary.

Purpose:
- make COS operationally proactive,
- increase founder trust and usability,
- turn the system into a real working assistant rather than a reactive shell.

### Track E — Harness proof instrumentation

Introduce evaluation-oriented data, such as:
- reviewer findings count,
- rework cause code,
- acceptance evidence,
- unresolved disagreement capture,
- correction hit rate,
- patch-quality delta where measurable.

Purpose:
- verify Harness quality uplift,
- make future customer trust defensible,
- separate appearance of teamwork from actual value.

---

## 9) Recommended W5–W7 roadmap

These are not fake “phases.”
They are bounded epics with clear product proof intent.

### W5 — Failure taxonomy + project-space binding graph

#### Goal
Make the system expose real breakpoints and preserve project-space truth.

#### Scope
- Track A
- Track B

#### Done when
- blocked/failed/escalated outcomes have explicit `resolution_class`,
- human-gate-required states are first-class,
- repo/deploy/db/env bindings are queryable under project space truth,
- founder/COS can see what is ready, what is blocked, and why.

#### Non-goals
- do not hardcode orchestration order,
- do not turn this into a workflow engine,
- do not implement customer-dedicated deployment packaging here.

### W6 — Scenario proof harness + Harness proof instrumentation

#### Goal
Prove whether the founder’s core scenarios actually run and whether Harness improves delivery.

#### Scope
- Track C
- Track E

#### Done when
- scenario 1 runner exists,
- scenario 2 runner exists,
- each produces structured proof output,
- failures are classified,
- Harness review/rework value can be inspected.

#### Non-goals
- do not fake scenario completion,
- do not handwrite success states,
- do not assume HIL away.

### W7 — Proactive COS operations + external tool qualification

#### Goal
Turn the system from an execution kernel into a founder-grade operating assistant.

#### Scope
- Track D
- selected tool qualification/ops verification improvements

#### Done when
- COS can proactively surface stale work, human gates, delivery readiness, and blocked operations,
- external tool lanes have clearer qualification states,
- founder no longer needs to constantly poll for operational truth.

#### Non-goals
- do not reopen core callback/tenancy infrastructure unless a real contradiction appears,
- do not introduce theatrical proactive messaging without truth-based triggers.

---

## 10) Scenario success criteria

### Scenario 1 — multi-project product build

A scenario-1 run is only counted as successful if:
- multiple project spaces can be opened without truth collision,
- repo/deploy/db binding truth is attached to the correct project space,
- Cursor/tool dispatch and closure can be traced to the right project context,
- human gates are explicit when needed,
- direction ↔ escalation traffic is durable and traceable,
- founder can inspect the state through COS without internal jargon.

### Scenario 2 — research → document → review → bundle

A scenario-2 run is only counted as successful if:
- research artifacts are captured,
- draft evolution is tracked,
- review actually happens,
- the bundle is a first-class deliverable object,
- founder receives a real downloadable or reviewable deliverable,
- human submission gates are explicit where automation should stop.

---

## 11) What success should feel like to the founder

After W7, the founder should be able to say:

- “This is actually running my work, not pretending to.”
- “When it gets stuck, I know why.”
- “When human action is needed, the system tells me exactly what kind and why.”
- “My projects do not blur into each other.”
- “COS does not just answer; it runs and reports.”
- “Harness is not just theater; it contributes observable value.”

If those statements are not true, the system is still short of the real product.

---

## 12) Immediate next action recommendation

The next product-core action should be:

> **W5 plan mode, narrowly scoped to failure taxonomy + project-space binding graph.**

Do not allow W5 to drift into:
- deployment packaging,
- customer-dedicated hosting model decisions,
- commercialization strategy,
- generic workflow-engine ambitions.

W5 must stay on the core product question:

> Can this system run real multi-project work, keep the truth straight, and tell us exactly why it breaks when it breaks?

That is the next gate between “interesting” and “real.”
