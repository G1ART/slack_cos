# W13 BULK MASTER INSTRUCTION — ACTUAL LIVE SURFACE / STAGING-SAFE REHEARSAL / RELEASE HYGIENE / BOOTSTRAP AUDIT / HARNESS QUALITY PROOF

**Version:** W13_bulk_febc8d9_design_partner_readiness_2026-04-16  
**Base:** main @ `febc8d9`  
**Mode:** PLAN FIRST, THEN EXECUTE IN COHERENT BUNDLES  
**Output language to founder:** Korean  
**Internal docs/code/tests:** existing repo style 유지

You are working on `slack_cos`.

This is not a symptom patch.  
This is a large, bounded W13 milestone bundle.

The product remains:
- founder-facing Slack COS only
- harness + external tools behind COS
- code is minimal transport / truth spine / adapter safety / audit / resumable HIL
- not a workflow shell
- not a command router resurrection
- not multi-app topology work
- not founder-surface theater

We are **NOT** reopening architecture philosophy.  
We are pushing the current architecture into a more honest and more usable design-partner-ready internal alpha.

The five W13 objectives are locked:

1. Actual live surface expansion on officially supported provider APIs
2. Supabase-backed bounded live rehearsal that remains safe and fail-closed
3. Release hygiene cleanup across stale preflight / SSOT / cheap drift
4. Bootstrap audit for partner install / BYO infra readiness
5. Harness quality proof instrumentation and audit

---

## 0) HARD START GATE — DO THIS BEFORE ANY CODE CHANGE

Run required-doc preflight first.

Use a new task id for this epic, for example:

```bash
npm run preflight:required-docs -- --task-id w13_bulk_live_surface_rehearsal_bootstrap_quality --write-ack-template ops/preflight_ack/w13_bulk_live_surface_rehearsal_bootstrap_quality.json
```

Then verify:

```bash
npm run verify:preflight-ack -- --manifest ops/preflight_manifest/w13_bulk_live_surface_rehearsal_bootstrap_quality.json --ack ops/preflight_ack/w13_bulk_live_surface_rehearsal_bootstrap_quality.json
```

If any required doc changes during the task, rerun preflight and refresh the ack before continuing.

Do not start implementation before verification passes.

---

## 1) CONTEXT LOCK — WHAT MUST NOT DRIFT

### Product identity
The founder talks to one COS in Slack.  
Harness and tools operate behind COS.  
The app must not reintroduce keyword routers, council theater, command-first drift, or founder-facing internal machinery.

### Architectural discipline
Code may enforce:
- strict envelopes
- tool/action schema safety
- truth/audit rows
- tenancy isolation
- resumable human gates
- live vs artifact honesty
- regression protection

Code must **NOT** start doing:
- semantic founder intent policing
- workflow-stage micromanagement
- “maturity” judgment over conversation
- faux automation claims
- fake live paths
- app-level approval theater

### Immediate maturity target
We are still not shipping a broad external beta.  
We are making the system:
- more truth-preserving,
- more qualified against real provider surfaces,
- safer in live rehearsal,
- more installable for design partners,
- and more measurable in harness quality.

---

## 2) W13 TOP-LEVEL NON-GOALS

Do **NOT** do any of the following in W13:

- No multi-app Slack topology
- No direct persona exposure to founder
- No broad new founder UX rewrite
- No workflow engine / planner resurrection
- No fake “full autonomous app factory” claims
- No unbounded provider expansion for vanity
- No DB over-normalization just because a graph exists
- No renaming already-applied migrations unless you can prove zero-risk and preserve migration ordering/history
- No silent drift against SSOT file names, headings, test names, or closeout docs

If a provider surface is not safely implementable live, keep it bounded and classify it honestly as not live-verified / human-gated / artifact-only.  
Do not pretend.

---

## 3) CURRENT ARCHITECTURE — UNDERSTAND BEFORE TOUCHING

Treat the current system as five interacting planes:

### A. Founder conversation plane
Slack intake → founder direct conversation → founder natural-language response.  
Founder sees only COS-quality Korean.  
No internal tool names or raw payloads.

### B. COS execution plane
COS decides when to call tools or delegate harness.  
Application code only validates machine contracts and adapters.

### C. Tool plane
Tool lanes are explicit adapters.  
Capability registry + qualification state + delivery readiness + propagation history together determine what is truly live, what is only configured, and what still needs human help.

### D. Truth / tenancy / audit plane
Committed operational truth belongs in durable rows / audit / read-models, not in founder wording.  
Project-space isolation is sacred.  
Cross-project contamination is a release-killer.

### E. HIL / resume plane
Human intervention is acceptable only if:
- why the human is needed is explicit
- where they must act is explicit
- what resumes afterward is explicit
- reopen/resume truth stays coherent

W13 must improve these planes without introducing a new “control shell” above them.

---

## 4) W13-A — ACTUAL LIVE SURFACE EXPANSION

### Goal
Expand the highest-ROI live tool surfaces that already have official provider support, and align:
- lane implementation
- capability qualification
- delivery readiness
- founder/operator truth wording

### Target surfaces
Prioritize in this order:

#### A1. GitHub
Implement real, safe repository-level secret/variable propagation paths where officially supported and aligned with current auth model.

At minimum:
- public key fetch / capability probe path where required
- create or update repository secret path
- metadata existence / verification path that does **NOT** pretend values are readable if they are write-only
- qualification integration so live write is only allowed when lane + capability are truly verified

Optional only if already near the current lane architecture:
- repository variable management
- environment-level secret handling

Do not widen scope into general repo bootstrap fantasies unless directly required by this path.

#### A2. Vercel
Implement actual project environment-variable live management.

At minimum:
- create env vars
- list/read metadata needed for verification
- update/edit where safe
- readiness/surface logic must explicitly reflect that env changes require redeploy to affect future deployments

Do not oversell Vercel as “deployment fully automated” unless the relevant deploy path actually exists and is proven.

#### A3. Railway
Implement real variable management through the supported Public API path.

At minimum:
- shared/service/environment variable read metadata
- create/update where supported
- qualification integration
- readiness explanation of what is live, what is verified, and what still needs operator action

If rendered/unrendered distinctions matter, preserve them in operator truth, not founder noise.

#### A4. Supabase
Do **NOT** explode scope into full project lifecycle management.  
Keep this bounded.

At minimum, improve the lane where there is clear ROI for design-partner readiness:
- project/org inspect capability
- settings/project metadata read where useful for readiness
- only add further management actions if they clearly improve W13 goals and can be fail-closed

### Required implementation rules
- Capability registry and lane implementation must move together.
- A provider must not appear “live-ready” just because docs say the API exists.
- Qualification artifact / ledger evidence must remain the source for `live_verified`.
- Keep write-only semantics explicit.
- Never store raw secret values in truth objects or snapshots.
- Avoid widening founder surface jargon.

### Required tests
Add and wire regression coverage for:
- qualified capability required before live write
- provider-specific verification semantics (write-only != readable)
- delivery readiness distinguishes ready / needs verification / human gate / not implemented
- no fake live claims in founder/operator summaries
- no cross-project leakage through newly added propagation paths

### Exit signal
A reviewer should be able to point to each implemented surface and answer:
- what exactly is live
- what exactly is only verified-by-metadata
- what is write-only
- what still requires human action
- what proof row/artifact establishes that fact

---

## 5) W13-B — SUPABASE-BACKED BOUNDED LIVE REHEARSAL

### Goal
Remove the current practical dead-end where live rehearsal is blocked in the very environment that most resembles real deployment, while still preserving fail-closed safety.

### Required outcome
Enable bounded live rehearsal in Supabase-backed mode **ONLY** when all of the following are true:
- the target is explicitly marked as rehearsal-safe / staging-safe / sandbox-safe
- the project-space binding proves isolation
- the allowed live writers are explicitly bounded
- the rehearsal mode is operator-visible and auditable
- shared production-like targets remain blocked

### Design guidance
Do **NOT** solve this by weakening protections.  
Do **NOT** “just allow it when env vars exist.”  
Do **NOT** let rehearsal mode silently fall through to production targets.

Instead, introduce an explicit rehearsal safety model, e.g.:
- rehearsal eligibility policy object / record / config
- sandbox/staging target classification
- allowlisted live writer subset
- auditable rehearsal verdicts and reasons
- explicit block reasons when conditions are not met

### Scenario scope
Rehearsal support must be useful for the two product-shaping paths:
- scenario 1 style multi-project / binding / tool-wiring path
- scenario 2 style research→bundle path with bounded human submission gate

### Required tests
Add coverage for:
- Supabase-backed mode still blocks non-sandbox targets
- sandbox-safe target allows bounded rehearsal
- rehearsal mode cannot cross project-space boundaries
- human gate reopen/resume remains coherent after rehearsal
- founder/operator wording does not imply wider automation than truly allowed

### Exit signal
A reviewer can run one bounded rehearsal in a Supabase-backed environment without violating truth, tenancy, or human-gate clarity.

---

## 6) W13-C — RELEASE HYGIENE CLEANUP

### Goal
Clean repo-wide operational drift that now threatens trust, closeout accuracy, and future patch safety.

### Mandatory scope

#### C1. Preflight / ack hygiene
Clean or intentionally reconcile stale preflight/ack drift left across older workstreams where practical and safe.

At minimum:
- detect stale manifests/acks repo-wide
- either refresh them or create an explicit auditable exception list / script output
- do not leave hidden drift

#### C2. SSOT drift cleanup
Fix cheap but real repository drift:
- headings/titles that no longer match SSOT file names
- stale references to removed docs
- test names / console signatures / doc labels that drifted
- closeout doc references that are now misleading

#### C3. Migration / ordering caution
Do **NOT** casually rename already-applied migration files.

If migration filename/date drift exists:
- assess whether it is safe to leave as-is with explicit debt note
- only normalize if you can prove it will not break applied environments

#### C4. Release gate visibility
Create or improve a simple repo-wide hygiene audit that makes these issues impossible to miss before partner-facing release work.

### Required tests / scripts
- repo-wide stale preflight/ack audit
- doc/reference drift checks where cheap and stable
- no false pass when required docs or milestone chunks changed

### Exit signal
W13 should leave the repo in a state where “green” actually means something closer to “closeout-trustworthy,” not merely “unit tests happened to pass.”

---

## 7) W13-D — BOOTSTRAP AUDIT FOR DESIGN-PARTNER INSTALL / BYO INFRA

### Goal
Create a single operator-facing audit path that answers:

> “Can this repo be installed for a design partner in a dedicated BYO-keys/BYO-infra setup without hidden missing pieces?”

This is **NOT** a marketing doc.  
This is an executable install-readiness audit.

### Required checks
At minimum audit:

#### D1. Repo / dependency integrity
- required packages exist for implemented lanes
- import/dependency drift
- scripts referenced in docs/package.json actually exist

#### D2. Environment completeness
- required env vars by mode
- live-writer flags
- provider tokens only when the corresponding live surface is enabled
- no silent fallback to unsafe defaults in partner mode

#### D3. Runtime / DB prerequisites
- required migrations present
- required RPC/functions/views referenced by live paths actually exist or are explicitly expected
- truth store mode is appropriate for partner mode
- memory mode is blocked or loudly marked unsafe in partner-facing setup

#### D4. Slack app / packaging prerequisites
- manifest/reference consistency
- required scopes/auth notes
- operator smoke path existence
- known human gate list alignment

#### D5. Provider capability / readiness coherence
- capability qualification artifacts present where needed
- readiness output matches actual lane implementation
- no provider is described as “live-ready” if only artifact or configured

### Deliverable
Create one clear audit command and one clear operator-facing result format:
- `pass`
- `pass_with_manual_gates`
- `fail_missing_prereq`
- `fail_drift`
- `fail_unsafe_mode`

### Required tests
- bootstrap audit catches missing dependency
- bootstrap audit catches partner mode + memory truth store
- bootstrap audit catches docs/script drift
- bootstrap audit catches enabled live writers without required tokens/config

### Exit signal
A non-expert operator can run one command and know whether a dedicated design-partner install is honestly ready, blocked, or unsafe.

---

## 8) W13-E — HARNESS QUALITY PROOF

### Goal
Move beyond “harness state exists” toward “harness quality contribution is measurable.”

### Important constraint
Do **NOT** turn this into abstract benchmark theater.  
Do **NOT** rewrite persona prompts for style.  
Do **NOT** create fake numeric precision without evidence.

### Required direction
Build minimal, honest instrumentation and audit around questions like:
- When did reviewer/risk steps actually intercept a bad or incomplete outcome?
- How often did rework materially change the final outcome?
- How often was false completion prevented?
- How often did human-gate reopen/resume stay coherent?
- Which run patterns show harness helping vs merely adding ceremony?

### Suggested implementation shape
Bounded and auditable:
- harness quality read-model and/or audit slices
- taxonomy of review/rework/block reasons
- scorecard or summary script that uses existing run/ledger/truth evidence
- optional manual operator rating hook for a small number of sampled traces, but clearly marked manual

### Preferred metrics
Only keep metrics that are truth-grounded, such as:
- `review_intervention_count`
- `rework_loop_count`
- `blocked_before_false_completion_count`
- `human_gate_reopen_coherence_count`
- `artifact_to_live_mismatch_count`
- `run_outcome_by_team_shape`
- scenario completion truthfulness indicators

### Required tests
- scorecard does not claim quality proof when evidence is absent
- read-model does not leak founder-facing internal noise
- metrics remain project-space isolated
- sampled run summaries survive mixed blocked/review/completed cases honestly

### Exit signal
We should be able to show, with evidence, whether Harness is helping run quality or merely existing.

---

## 9) GLOBAL IMPLEMENTATION RULES

### Rule 1 — Fix drift when you see it
If you discover repo/SSOT drift directly adjacent to W13 work, fix it in the same patch unless doing so is genuinely risky.  
Do not leave silent drift behind.

### Rule 2 — Preserve founder surface contract
No internal raw payloads.  
No command-router leakage.  
No tool names dumped at founder.  
No fake certainty.

### Rule 3 — Fail closed
If qualification is missing, stay bounded.  
If verification is impossible, say so in operator truth.  
If a live write cannot be proven safe, do not enable it.

### Rule 4 — Keep bundles coherent
Prefer a few coherent commits or one disciplined bulk patch over a cloud of tiny unrelated edits.

### Rule 5 — Tests are part of the patch, not afterthoughts
If a new path exists without regression coverage, the patch is incomplete.

---

## 10) REQUIRED TEST / VERIFICATION MATRIX

Before closeout, run and report at least:

1. `npm test`
2. Any new W13-specific audit scripts
3. Relevant preflight verification for this W13 task
4. Bootstrap audit in:
   - minimal/local non-live mode
   - partner/live-flag mode with missing prereqs
   - partner/live-flag mode with satisfied prereqs where possible
5. Rehearsal gate verification in:
   - unsafe/shared target case
   - sandbox-safe target case
6. Provider lane verification paths for each newly implemented live surface
7. Cross-project contamination regression focused on any newly added secret/variable propagation paths

If any one of these cannot be run, say exactly why and leave an explicit bounded note in closeout.

---

## 11) DOC / OPS CLOSEOUT REQUIREMENTS

You must update, at minimum, if touched by W13:

- `docs/cursor-handoffs/COS_Upgrade_Milestones_2026-04-16.md`
  - add W13 section with:
    - W13-A~E summary
    - non-goals
    - open risks
    - next recommendation

- `docs/cursor-handoffs/COS_Gap_Register_And_Workstream_Plan_2026-04-15.md`
  - add/update W13 total report section
  - explicitly mark which prior gaps are now narrowed vs still open

- `docs/runtime_required_docs.json`
  - if W13 introduces a new workstream/task entry that should become part of the hard gate

- relevant packaging/operator docs under `docs/design-partner-beta/`
  - only if actual install/bootstrap semantics changed

- preflight manifest / ack artifacts for this W13 task
  - and any repo-wide stale ack cleanup work you performed

Do not leave closeout docs stale.

---

## 12) REQUIRED FINAL OUTPUT FORMAT FROM YOU (CURSOR)

When done, report in this exact structure:

### A. Executive result
- what W13 closed
- what W13 intentionally did not close
- whether the repo is now closer to design-partner installability vs merely cleaner

### B. Files changed
- grouped by W13-A / B / C / D / E
- one-line rationale per file

### C. Tests and audits
- exact commands run
- exact pass/fail summary
- any unrun item with reason

### D. User actions required
Only include actions the founder/operator must actually do, in copy-paste-ready form:
- SQL to run
- env vars to set
- provider/dashboard actions
- Slack manifest/app actions
- redeploy/restart commands
- git commands if needed

### E. Open risks
- honest remaining gaps after W13
- especially anything that still blocks design-partner beta

### F. Recommended next patch
- one bounded W14 recommendation only
- with rationale

### G. Handoff update
- concise but complete
- enough that the next chat can continue without rereading the whole repo

---

## 13) FINAL PRIORITY ORDER IF YOU MUST TRADE OFF

If time/complexity forces trade-offs, prioritize in this order:

1. truthful live surface + qualification coherence
2. safe Supabase-backed rehearsal gate
3. bootstrap audit
4. repo hygiene / stale ack cleanup
5. harness quality proof depth

Under no circumstances trade truth for breadth.  
Under no circumstances ship fake live behavior.  
Under no circumstances reintroduce thick app-level orchestration logic.

Proceed.
