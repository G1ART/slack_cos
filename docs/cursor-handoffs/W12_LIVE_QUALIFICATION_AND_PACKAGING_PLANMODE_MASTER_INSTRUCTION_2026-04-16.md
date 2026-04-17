# [PLAN MODE MASTER INSTRUCTION]
# slack_cos — W12 Live Qualification, Secret Source-of-Truth, and Design-Partner Beta Packaging
# Baseline: main `3a59fe2`
# Purpose: move from strong internal alpha toward a bounded external design-partner beta without reopening core founder/COS/Harness philosophy

## 0) Hard framing

This epic is **not** a broad rewrite.
This epic is **not** a public-marketplace launch plan.
This epic is **not** a request to add more “impressive” surface features.

This epic exists to answer one question:

> Can the current Slack COS runtime be trusted to run bounded, real project-space automation with clear human-gate escalation, secret/env propagation discipline, and repeatable live rehearsal — enough to onboard a small number of external design partners?

The answer must be established with:
- live qualification
- bounded rehearsal
- capability truth
- packaging clarity
- no fake automation claims

## 1) Product truths that must remain intact

Preserve all of the following:
- Founder sees **COS only**
- Harness and tools remain behind COS
- Code stays minimal where possible:
  - identity / tenancy / traceability / safety / audit / transport
- Do **not** convert the product into a workflow engine
- Do **not** add new founder send paths
- Do **not** reopen callback authority / founder surface core / tenancy core unless explicitly required by this epic
- Do **not** store raw secret values in persistence, audit, or founder-facing surfaces

## 2) What W12 is really for

W12 is the bridge between:
- “internal founder-grade alpha”
and
- “bounded external design-partner beta”

That means W12 must close the remaining near-must gaps in five areas:

### Q1. Capability qualification
Current live binding capability registry is helpful, but partially conservative and partially unverified against real provider behavior.
W12 must move capability truth toward **verified capability truth**.

### Q2. Secret source-of-truth and propagation discipline
The system should know:
- where a required value comes from
- whether it can be read back
- whether it is write-only
- which sinks can receive it
- how propagation is verified
- where a human gate is unavoidable

### Q3. Resumable human-gate UX
When automation cannot continue without a human step, COS must escalate:
- what is needed
- where it must be done
- why it is needed
- what resumes after it is done

This must remain traceable and resumable by project space.

### Q4. Live rehearsal qualification
Scenario 1 and Scenario 2 must both have bounded live rehearsal modes that expose:
- break_location
- break_reason_kind
- break_reason_cause
- resolution_class
- human gate state
- delivery readiness

### Q5. External design-partner packaging
The product must be packaged clearly enough that a customer-dedicated deployment / BYO-keys / BYO-infra beta is realistic.

This does **not** mean public launch.
It means repeatable installation and bounded operator setup.

## 3) Explicitly in scope

### W12-A — Verified capability matrix
Build a stronger capability qualification layer for supported sinks/providers.

Examples:
- GitHub Actions secrets
- Vercel project env vars
- Railway variables
- Supabase management / project bindings
- Cursor Cloud environment / secrets / startup config
- Slack app manifest / install/runtime packaging assumptions

Goal:
- registry values should not remain pure assumptions
- each supported sink should carry:
  - can_write
  - can_verify_existence
  - can_read_back_value
  - requires_manual_confirmation
  - verification_modes_supported
  - required_human_action
  - qualification_status
  - last_verified_at
  - last_verified_mode
  - notes / caveats if needed

Important:
- Do not invent capabilities not actually supported.
- Where capability is uncertain, keep it conservative and explicit.

### W12-B — Secret source-of-truth graph
Introduce a structured model for required secret/env values.

Minimum fields per required binding value:
- value_name
- source_kind
- source_ref
- source_read_mode
- sink_targets[]
- write_policy
- verification_policy
- manual_gate_required
- redaction_policy

Goal:
- make propagation deterministic
- distinguish read-back capable vs write-only sinks
- stop relying on operator memory

Do **not** persist raw secret values.
The system should carry metadata and flow intent, not plaintext secrets.

### W12-C — Human-gate escalation contract
Strengthen founder-facing escalation quality without adding a new send path.

Need a compact, structured escalation contract that can answer:
- why founder is needed
- where founder must act
- what exact action is required
- whether the gate is resumable
- what resumes next

This must map cleanly from:
- failure taxonomy
- human gate runtime
- propagation plan / delivery readiness

Founder-facing output must remain natural, short, and jargon-free.

### W12-D — Live rehearsal qualification mode
Expand bounded live rehearsal so that it can meaningfully qualify external automation.

Must cover:
- scenario 1 multi-project spinup (repo / deploy / db / env / gate)
- scenario 2 research-to-bundle with explicit human submission boundary

Need:
- clearer live rehearsal mode gates
- stable scorecard output
- explicit capability mismatch reporting
- project-space-specific readiness summary

### W12-E — Beta packaging prep
Create the minimum packaging and operator materials for design-partner deployment.

This is **not** broad commercialization.
This is bounded packaging for small external pilots.

Must include:
- Slack app manifest source
- install / distribution notes
- required scopes / auth assumptions
- `.env.example` or equivalent
- deployment recipe assumptions
- BYO keys / BYO infra stance
- operator smoke test checklist
- known human-gate points

## 4) Explicitly out of scope

Do **not**:
- build public marketplace distribution in this epic
- reopen W1/W2/W3 callback or truth-core logic without hard necessity
- redesign founder surface wholesale
- add multi-bot founder interaction
- add OCR / PDF deep extraction here
- add generic workflow engine / deterministic step scheduler
- promise “fully automatic” provisioning where provider policy still requires human approval

## 5) Architecture guidance

## 5.1 AI vs code boundary
Keep this distinction strict.

### AI should decide:
- sequencing
- when to parallelize
- when to retry
- whether to escalate
- how to explain status to founder
- how to use Harness roles

### Code should guarantee:
- project-space identity
- durable truth
- human-gate state
- propagation metadata
- capability constraints
- auditability
- redaction
- bounded founder transport

## 5.2 Packaging model
Assume early beta prefers:
- customer-dedicated deployment
- customer-owned keys
- customer-owned infra/accounts where possible

Do not optimize W12 around “shared free hosted model”.

## 5.3 Capability truth style
Prefer:
- verified capability registry entries
over:
- hand-wavy documentation assumptions

If a provider’s capability is not yet qualified in live rehearsal:
- mark it conservatively
- do not overstate automation support

## 6) Concrete implementation slices

### Slice A — Capability qualification registry extension
Likely touch:
- `src/founder/liveBindingCapabilityRegistry.js`
- new helper(s) for qualification metadata
- read-model slice or audit CLI where appropriate

Need:
- additive fields only
- no breaking change to existing registry consumers
- conservative fallback if qualification metadata missing

### Slice B — Source-of-truth binding value model
Likely touch:
- new file such as `src/founder/secretSourceGraph.js`
- propagation plan builder
- propagation engine
- project-space binding graph writer/reader
- read-model/audit-only slices as needed

Need:
- no plaintext secret persistence
- source/sink/verification structure available for qualification and audit
- strong redaction everywhere

### Slice C — Founder-facing human gate contract
Likely touch:
- failure taxonomy mapping
- human gate runtime
- delivery readiness summary
- founder-facing escalation summary builder
- possibly W4 founder surface model if strictly needed, but keep modifications minimal

Need:
- founder text must remain short and natural
- human gate reason must be explicit and actionable
- “what resumes next” must be expressible

### Slice D — Live rehearsal strengthening
Likely touch:
- scenario proof live runner
- scenario scorecard / classifier
- delivery readiness audit CLI
- capability mismatch reporting

Need:
- honest inconclusive outcomes where auth/config is absent
- explicit break_reason_cause
- compact outputs suitable for operator review

### Slice E — Design-partner packaging
Likely touch:
- docs / examples / manifest sources / env examples / operator checklist
- no fake generic packaging
- document actual assumptions only

## 7) Required tests

At minimum, add/strengthen tests for all of the following:

### Capability qualification
- unknown sink remains fail-closed
- capability metadata can be absent without crashing
- qualification fields do not leak secrets
- unsupported verification mode degrades honestly

### Secret source graph
- source metadata present, value absent
- write-only sink classification handled correctly
- read-back-capable sink classification handled correctly
- mixed sink fanout does not leak values into audit/read-model
- project-space separation preserved

### Human gate contract
- founder-facing escalation text stays jargon-free
- required action is explicit
- resumable gate preserves continuation truth
- reopen/resume still traceable
- no raw token/URL/secret leak

### Live rehearsal
- scenario 1 live rehearsal returns coherent scorecard
- scenario 2 live rehearsal returns coherent scorecard
- inconclusive reasons remain honest
- break_reason_cause and resolution_class align
- delivery readiness audit distinguishes ready / blocked / gate-open / needs-verification

### Packaging
- manifest/example/env docs are internally consistent
- no packaging doc claims unsupported automation

## 8) Completion criteria

W12 is complete only when:

1. capability registry is materially more verified and explicit than today
2. secret/env propagation has a real source-of-truth model
3. founder-facing human gate escalations are short, actionable, and resumable
4. live rehearsal exposes real break causes instead of generic failure
5. design-partner packaging exists for bounded external pilots
6. no new founder send path has been introduced
7. no raw secret value leaks into persistence, audit, or founder-facing output
8. `npm test` remains green

## 9) Operator reporting requirements

At closeout, report in this exact shape:

1. **Implemented**
   - files added/changed
   - major invariants introduced
   - any migrations

2. **Capability qualification changes**
   - which sinks/providers changed
   - what is now verified vs still conservative
   - any assumptions still unresolved

3. **Secret propagation model**
   - source-of-truth structure added
   - what is stored vs deliberately not stored
   - verification strategy by sink type

4. **Human gate contract**
   - what founder now sees
   - what remains audit-only
   - how resume/reopen changed

5. **Live rehearsal**
   - what scenarios were exercised
   - fixture vs live boundaries
   - what still remains inconclusive

6. **Packaging**
   - artifacts/docs added
   - what a design partner would need to supply
   - what still requires manual operator support

7. **Open risks**
   - provider capability mismatches
   - manual steps still required
   - anything still too conservative or too optimistic

8. **Next recommendation**
   - whether to proceed to external design-partner beta
   - or whether one more internal qualification epic is still required

## 10) Final instruction

Implement this as a **bounded qualification-and-packaging epic**.

Do not drift into:
- feature creep
- workflow-engine logic
- fake “full automation” claims
- broad commercialization work

The purpose is to turn a strong internal alpha into a narrowly deployable, honestly qualified design-partner beta candidate.
