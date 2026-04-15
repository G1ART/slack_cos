# WHAT WE ARE BUILDING

## Status
Implementation SSOT companion. The constitution remains the only governing document.

## Strategic axes (what we are optimizing for)

Three intertwined goals. Slack stays the **founder-facing interface**; **committed operational truth** stays in durable store and audit rows, not in founder wording (see Non-negotiable product rules below).

1. **Founder-facing COS (Slack) — interface quality and situational depth**  
   The founder experiences **one** COS: natural, concise, accurate Korean; no internal code names, packet/webhook jargon, or false certainty; chief-of-staff / PM / chief-engineer feel — not a brittle workflow shell. **Behind that surface**, COS is expected to stay deeply aligned with execution reality by using **raw thread memory, execution-ledger summaries, closure mirrors, structured execution-context reads when appropriate, and tools/adapters** — strong “full stack” awareness of what actually ran and what the DB says **without** the app replacing COS judgment with keyword routers, councils, or semantic classifiers on founder text.

2. **COS ↔ Harness workcell — org-shaped scope and R&R, not vibe-only**  
   Harness is the **internal** multi-agent group COS assembles per turn. The target is a **designed organization**: explicit scope and R&R, healthy tension and critique in service of run success — not merely different prompt tones. **Implementation philosophy:** clad COS and Harness in **code only where mechanically necessary** (strict envelopes, adapter safety, ledger visibility, tenancy on rows, regression tests). Do not encode “team culture,” debate choreography, or approval theater in application logic.

3. **Parcel office — high-throughput multi-product / multi-project-space external orchestration**  
   Runs, packets, dispatch evidence, **provider-callback authority**, authoritative closure, progression patches, supervisor wake, and queryable audit — so parallel lanes do not scramble **work orders vs reports**. The **ultimate** direction includes more automation for spin-up and wiring (e.g. new GitHub repos, Supabase projects, deploy tenants) **without** blurring tenancy, identity, or completion truth.

### Implementation philosophy (with constitution §1, §9)

- **Minimal armor:** prefer **model-native orchestration** and COS’s own tool choices over new in-code planners or semantic gates for routine COS↔Harness collaboration.
- **Spine protection:** do not reopen parcel-office core (callback authority, closure) without a regression proven against **committed** run state.

## One-line definition
G1 COS is a Slack-native Chief of Staff runtime. The founder speaks to one human-readable COS in Slack, while behind that interface a harness of AI agents and external tools executes work using shared run, packet, and audit language.

## What this is not
This is not a generic Slack bot, not a slash-command workflow shell, not a council-style persona theater, and not a fake agent OS that mainly emits reports. It is a real execution system that must close the loop between natural-language instruction, delegation, external execution, callback closure, audit, and founder-visible completion.

## Founder-facing ideal form
The founder should experience one primary interface: COS. Slack output must stay natural, concise, accurate, and free of internal code names, packet internals, webhook jargon, or false certainty. The founder should feel they are talking to a sharp Chief of Staff / PM / Chief Engineer, not operating a brittle workflow engine.

## Internal ideal form
Internally, every meaningful execution is a run. Every execution step is a packet or milestone. Run, thread, packet, project space, workspace, product, and deployment identifiers must not drift or get mixed casually. Human-readable Slack prose and machine-readable audit rows are different surfaces with different jobs.

## Parcel-office execution spine
The system behaves like a parcel office. A founder request becomes a run. The run creates authoritative packet identity. External dispatch is recorded. Signed callback arrives. Authoritative callback closure is applied. Packet progression is patched. Supervisor wake is enqueued. Founder milestone is sent. A run is not complete because it looks successful; it is complete only when authoritative closure and progression are committed.

## Layer model
The product has four layers with strict role separation: Founder, COS, Harness, and External Tools. Founder sees only COS. Harness and tools live behind COS. App code is a minimal carrier plus adapters and evidence ledger, not a meaning-interpreter that tries to replace model judgment.

## COS responsibilities
COS owns natural-language understanding, scope refinement, plan proposal, delegation choice, progress synthesis, and founder communication. COS is the founder-facing orchestrator and must preserve long-term product philosophy. COS should not leak internal execution mechanics into founder-facing speech.

## Harness responsibilities
Harness is the internal multi-persona execution group. It breaks work into packets, assigns role-specific tasks, reviews and challenges work, prepares external-tool execution bundles, and escalates decision-grade issues back to COS. Harness is not today's primary founder-facing interface. It must become a real internal workcell, not just a collection of prompt variants.

## External-tool responsibilities
External tools such as Cursor, GitHub, Supabase, Vercel, and Railway perform real work. They do not define truth by themselves. They participate in a shared execution contract. Live success is not completion unless callback closure and progression are committed into the run state.

## Truth hierarchy
Founder-facing same-thread continuity should primarily come from execution ledger summary and closure mirror. Deeper inspection should come from structured execution-context reads. Operational truth for smoke, audit, and multi-product observability belongs in the Supabase run store and event summaries. These surfaces must stay distinct and not mimic one another.

## Tenancy and multi-product direction
This runtime is not a single-project toy. It must grow into a multi-product operating system. Shared data infrastructure can serve multiple products, deployments, workspaces, and project spaces, but parcel-office records must never blur across tenants. Stable keys such as workspace_key, product_key, project_space_key, and deployment_key are part of the architecture, not optional add-ons.

## Persona contract direction
A persona should eventually mean more than tone. It should carry a distinct system prompt, tool scope, deliverable schema, and review or challenge role. It is acceptable to begin with prompt-level differentiation, but the architecture must be ready to promote personas into full execution contracts.

## Non-negotiable product rules
- Slack is the founder interface, not the operational source of truth.
- Database audit state is the operational source of truth, not founder wording.
- Fallback evidence may exist, but strict provider paths must preserve provider callback authority.
- Same-turn acknowledgement is allowed; false completion is forbidden.
- Every patch should make the parcel office more deterministic, not more theatrical.

## Current direction lock
- Founder-facing Slack remains COS-first for now.
- Progress and completion truth stay ledger-first, context-second, audit-third by usage layer.
- Harness runtime stays simple now but must be extensible toward multi-app or multi-bot topology later.
- Multi-product shared DB and audit slicing are first-class concerns, not backlog ornaments.

## Operating intent (founder · Slack)
The founder treats this Slack surface as the **primary cockpit for high-velocity MVP-style product iteration** (the same job category as dedicated “build the product” UIs), while staying **COS-first and natural-language-first**: outbound speech stays human, concise, and free of internal mechanics.

Normal operations assume **many products, many repos, and many project spaces advancing in parallel**. The runtime must therefore behave as **one disciplined internal company**: **parcel-office-grade** execution (runs, packets, authoritative callback closure, queryable audit) plus **hard tenancy boundaries** so parallel lanes never blur identity, truth, or control.

## North star
The founder talks naturally to one COS in Slack. Behind that, harness agents and external tools operate continuously using the same run language. Work actually gets done. State actually closes. The audit trail is queryable. And the system scales from one execution thread to many products and many project spaces without losing identity, truth, or control.

## Implementation consequences
- If a patch solves a local bug but drifts away from this product identity, the patch is wrong.
- If a feature adds theater, duplicated truth, or fake completion, it is a regression even if the UI looks polished.
- If a proposal cannot be expressed in run/packet/project-space language, it is not mature enough for implementation.

## Patch-review checklist
1. Does this change preserve COS as the founder-facing interface of record?
2. Does it make run, packet, callback, or audit truth more deterministic rather than more ad hoc?
3. Does it avoid leaking internal mechanics into founder-facing Slack text?
4. Does it strengthen or at least preserve tenancy boundaries across deployment, workspace, product, and project space?
5. Does it move Harness closer to a real internal workcell rather than a cosmetic multi-prompt layer?
