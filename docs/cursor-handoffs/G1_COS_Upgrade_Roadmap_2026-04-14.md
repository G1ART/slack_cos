# G1 COS Upgrade Roadmap (2026-04-14)

## Status
Detailed north-star roadmap beyond MVP. Derived from the constitution and WHAT_WE_ARE_BUILDING.

## Program design rules
- Do not re-open parcel-office core unless a regression is proven.
- Prefer 10 large milestone bundles over dozens of tiny symptom patches.
- Each milestone must change real product capability, not just observability or wording.
- Every milestone must state non-goals so Cursor cannot wander into adjacent cleanup work.

## Milestone summary
| Milestone | Purpose | Primary layer | Exit signal |
|---|---|---|---|
| M1 | Lock cross-layer canonical envelope | COS↔Harness↔Tools | All run/packet keys unified |
| M2 | Build Harness persona contract plane | Harness | Personas become contracts, not just tones |
| M3 | Turn Harness into workcell runtime | Harness | Role-based packet collaboration works |
| M4 | Unify external tool adapters | Tools | Shared execution contract across tools |
| M5 | Complete truth stack v2 | COS + audit | Slack/context/audit truths stop conflicting |
| M6 | Finish tenancy data plane | DB + audit | Workspace/product/deployment slicing is real |
| M7 | Ship ops control plane | Ops | Release gates and health checks become operational |
| M8 | Add multi-app Slack topology | Slack runtime | Multiple app identities are supported |
| M9 | Selective direct persona access | Founder UX | Controlled direct access is possible |
| M10 | Productize orchestration OS | Whole system | Parallel multi-product execution feels native |

## M1 — Canonical envelope across layers
**Objective**  
Turn run/packet/thread/project-space/deployment/workspace/product language into a real shared execution envelope used across COS, Harness, adapters, audit rows, and callback closure.

**Build scope**
- Define one canonical execution envelope spec used by Harness dispatch, tool invocation, callback, artifact record, review item, and audit event.
- Ensure run_id, packet_id, thread_key, workspace_key, product_key, project_space_key, and deployment_key are available wherever they must be authoritative.
- Remove ad hoc per-layer field aliases where possible or map them explicitly in one place.
- Add contract tests that fail when a layer drifts from the shared envelope.

**Non-goals**
- Do not redesign founder-facing wording here.
- Do not expand persona count here.

**Completion signals**
- Every main execution row and callback path speaks the same identifier language.
- A reviewer can trace one run from Slack intake to external callback without field-name ambiguity.

## M2 — Harness persona contract plane
**Objective**  
Promote personas from prompt-only entities into explicit internal execution contracts.

**Build scope**
- Create a persona contract manifest in-repo, versioned and reviewable.
- Each persona contract should define prompt, tool scope, deliverable shape, review responsibility, and escalation behavior.
- Start with a minimal core set such as planner, researcher, implementer, reviewer, and risk gate.
- Teach COS to assemble a Harness team from contracts rather than free-form prompt fragments.

**Non-goals**
- Do not expose multiple persona bots to the founder yet.
- Do not move persona definitions into DB yet.

**Completion signals**
- Harness roles are stable, inspectable, and reusable across projects.
- Patch instructions stop re-defining persona behavior from scratch every time.

## M3 — Harness workcell runtime
**Objective**  
Make the Harness group a real internal workcell that collaborates through packets and review checkpoints.

**Build scope**
- Introduce internal packet handoff stages between planner, implementer, reviewer, and risk gate.
- Support intra-run reviewer challenge and corrective loop before external dispatch or founder escalation.
- Capture review checkpoints and disagreements as structured internal evidence, not founder-facing noise.
- Ensure COS stays the orchestrator while Harness does substantive delegated work.

**Non-goals**
- Do not add cosmetic council-style output.
- Do not make founder the approval bottleneck for routine internal handoffs.

**Completion signals**
- One run can contain multi-role internal collaboration before or around tool execution.
- Review and challenge become first-class runtime behaviors, not manual conventions.

## M4 — External tool adapter unification
**Objective**  
Move from tool-specific bespoke logic toward one shared execution contract with adapter-specific edges.

**Build scope**
- Define shared meanings for accepted, running, callback received, closure applied, artifact-only result, and advisory evidence.
- Refactor Cursor, GitHub, Supabase, Vercel, Railway, and future adapters to implement the same contract.
- Keep tool-specific quirks inside adapters; expose shared run semantics upward.
- Make live versus artifact execution an explicit contract concept across tools.

**Non-goals**
- Do not chase every tool feature yet.
- Do not re-open parcel-office closure logic except where shared-contract migration requires it.

**Completion signals**
- Tool switching no longer changes the meaning of run state.
- COS and Harness can reason about tools generically where appropriate.

## M5 — Truth stack v2
**Objective**  
Separate founder-thread truth, COS deep context truth, and operational audit truth cleanly and permanently.

**Build scope**
- Stabilize ledger-first founder continuity.
- Use structured execution-context reads for deeper review and ambiguous states.
- Use Supabase summaries and audit tables as operational truth for smoke, on-call, and multi-product visibility.
- Add anti-conflict tests so Slack wording cannot contradict committed run state.

**Non-goals**
- Do not dump audit rows directly into Slack prose.
- Do not make every founder turn query deep operational state.

**Completion signals**
- Same run tells one consistent story across Slack, context reads, and operational summaries.

## M6 — Tenancy data plane completion
**Objective**  
Make multi-product, multi-workspace, multi-deployment operation a first-class property of the data plane.

**Build scope**
- Propagate tenancy keys through runs, packets, audit events, artifacts, review queues, and summary views.
- Add RPCs, views, or scripts for slicing by deployment, workspace, product, and project space.
- Validate tenancy-key presence at boot and in release checks.
- Prevent parcel-office records from blurring across tenants.

**Non-goals**
- Do not try to solve full automatic tenant discovery yet.
- Do not over-generalize schema before minimum keys are enforced everywhere.

**Completion signals**
- On-call or founder ops can slice health and audit trails by tenant axes quickly and reliably.

## M7 — Ops control plane
**Objective**  
Turn release readiness, health checks, and smoke validation into an operational control plane rather than tribal knowledge.

**Build scope**
- Promote verify:parcel-post-office, audit:parcel-health, and short Slack scenario checks into a release gate bundle.
- Separate migration checks, environment checks, and live smoke checks clearly.
- Surface boot truth for connectors, lease mode, tenancy keys, callback signature mode, and summary availability.
- Create concise operator commands for health and post-deploy verification.

**Non-goals**
- Do not overbuild dashboard UI first.
- Do not mix product UX work into operator-plane milestones.

**Completion signals**
- Deploys become auditable and repeatable, with fewer ambiguous works-on-my-machine moments.

## M8 — Multi-app / multi-bot Slack topology
**Objective**  
Prepare the runtime to support multiple Slack app identities and internal bots without losing one execution language.

**Build scope**
- Abstract app identity, bot identity, and routing context.
- Support internal-only harness bots or channels while founder remains COS-first.
- Design a migration path from single-process single-app to single-process multi-app, and later to broader decomposition if needed.
- Keep audit identity explicit so messages and events remain attributable.

**Non-goals**
- Do not let founder-facing clarity regress.
- Do not explode the architecture into distributed complexity before contracts are ready.

**Completion signals**
- The runtime can host COS and internal harness identities without confusing role ownership or audit trails.

## M9 — Selective direct persona access
**Objective**  
Allow carefully bounded founder interaction with selected personas once role boundaries and auditability are mature.

**Build scope**
- Define when founder may directly address a persona and when COS must remain the sole interface.
- Log direct-persona interactions under the same run/project-space language.
- Ensure COS remains the orchestrator and final responsibility holder.
- Keep direct access opt-in and narrow.

**Non-goals**
- Do not turn the product into a founder-facing bot swarm.
- Do not bypass COS for routine execution management.

**Completion signals**
- Direct persona access becomes a deliberate advanced capability, not the default experience.

## M10 — Productized orchestration OS
**Objective**  
Complete the transition from parcel-office reliability into a founder-operable orchestration operating system.

**Build scope**
- Run multiple projects and products in parallel with clear audit slicing.
- Let COS coordinate multiple Harness workcells and tool lanes continuously.
- Preserve deterministic execution truth while keeping founder UX simple.
- Treat workspaces, products, and project spaces as native operational units.

**Non-goals**
- Do not regress into single-project assumptions.
- Do not let cosmetic UX outrun execution truth.

**Completion signals**
- The system feels like one coherent OS for founder-led execution, not a chain of stitched-together automations.

## Roadmap sequencing guidance
1. Do not start Milestone 8 or 9 before Milestones 1 through 6 are materially real.
2. Do not reopen parcel-office core unless a regression is proven by committed run state, not just wording.
3. Do not let founder-facing surface cleanup consume milestones intended for Harness and tenancy architecture.
4. Treat each milestone as a large patch bundle with explicit entry and exit criteria, not as endless small symptom patches.

## Recommended immediate next three milestones
1. Milestone 1 — Canonical envelope across layers
2. Milestone 2 — Harness persona contract plane
3. Milestone 6 — Tenancy data plane completion
