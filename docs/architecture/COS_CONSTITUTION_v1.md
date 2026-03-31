# COS Constitution v1.1 — Work-State-First Chief of Staff OS

> SSOT for all founder-facing routing, rendering, and outbound in the G1.ART COS Slack bot.
> Code changes MUST reference this document. If code and doc diverge, doc wins until code is patched.
>
> v1.1 counter-spec applied: center of gravity is work_object → work_phase → policy → packet → surface.

---

## 1. North Star

G1.ART COS is a **Slack-native Chief of Staff OS** for a single founder.
It is not a safer response router. It is an operating system that:
- receives a founder's request,
- resolves which **work object** (project / run / packet) the request belongs to,
- determines which **work phase** the request falls in,
- applies **policy** (actor + state + risk + capability),
- executes through **internal agents** (object-only, never raw founder text),
- assembles a **founder-facing packet**,
- renders through a **typed surface**,
- sends through a **single outbound gate**.

---

## 2. Founder-Facing Contract

The founder interacts with COS exclusively through **typed surfaces**.
COS never sends free-form text produced by an internal agent.

Guarantees:
- Every founder message receives exactly one response through `founderOutbound.send()`.
- Every response has an explicit `surface_type` from the Surface Registry (section 5).
- If work object or phase cannot be resolved:
  - Exploratory but under-specified → `discovery_surface` (COS narrows the scope).
  - Invalid or unsafe → `safe_fallback_surface`.
- Council deliberation objects never reach the founder as raw markdown.
- Stored query data (`query_lookup`) also passes through a renderer — raw trust is forbidden.

---

## 3. Internal Agent Contract

Internal agents (Council, partner, research, planner, risk_review, strategy_finance, etc.)
return **structured objects** — never founder-facing strings.

Object types:
```
DeliberationResult  — recommendation, viewpoints, objections, risks, tensions, next_actions, approval_needed
EvidenceObject      — source, summary, proof_refs[], confidence
ProposalObject      — option_id, title, tradeoffs, risk_level, estimated_cost, estimated_time
RiskObject          — risk_id, description, severity, mitigation, owner
```

Only `founderRenderer` may convert these objects into founder-facing text,
and only through a registered surface template.

Forbidden in any internal module's founder-facing output:
- 종합 추천안, 페르소나별 핵심 관점, 가장 강한 반대 논리
- 핵심 리스크, 대표 결정 필요 여부, 내부 처리 정보
- 참여 페르소나:, strategy_finance:, risk_review:
- 승인 대기열 (as raw section header with bullet body)

---

## 4. Policy Engine (replaces Authority Model)

Every founder request is first resolved into a **work object** and **work phase**
before policy is assigned. Intent classification is a supplementary signal, not the primary axis.

Policy assignment is deterministic given `(actor, work_object, work_phase, risk_class, requested_capability, metadata)`.

```
PolicyContext = {
  actor:                'founder' | 'internal_agent' | 'tool_adapter',
  work_object_type:     'project_space' | 'execution_run' | 'intake_session' | 'none',
  work_phase:           WorkPhase,
  risk_class:           'informational' | 'bounded_action' | 'external_side_effect' | 'irreversible',
  requested_capability: 'read' | 'deliberate' | 'propose' | 'seed' | 'execute' | 'publish' | 'escalate' | 'rollback',
  intent_signal:        FounderIntent (supplementary),
  metadata:             { thread, channel, user, ... }
}

PolicyDecision = {
  allow:                    boolean,
  required_surface_type:    FounderSurfaceType,
  allowed_capabilities:     string[],
  requires_packet:          boolean,
  requires_approval:        boolean,
  deny_raw_internal_text:   true (always),
  fallback_mode:            'discovery' | 'safe_fallback' | null
}
```

Core rules:
- `deny_raw_internal_text`: ON for every request, including `query_lookup`.
- `requires_packet`: ON for execution, approval, deploy phases.
- `requires_approval`: ON when risk_class is `external_side_effect` or `irreversible`.

---

## 5. Surface Type Registry

### Meta / Utility
| Surface Type | Description | Freedom Level |
|---|---|---|
| `runtime_meta_surface` | Version, build info, runtime diagnostics | L0 strict |
| `meta_debug_surface` | Bounded meta explanation about COS internals | L2 bounded narrative |
| `help_surface` | Help text | L1 semi-structured |
| `safe_fallback_surface` | Safe error / retry prompt | L0 strict |
| `discovery_surface` | Under-specified but promising input — COS narrows scope | L2 bounded narrative |

### OS Surfaces
| Surface Type | Description | Freedom Level |
|---|---|---|
| `project_space_surface` | Current project space and scope status | L1 semi-structured |
| `run_state_surface` | Current run stage, lane status, progress | L1 semi-structured |
| `execution_packet_surface` | Execution scope lock, next actions | L0 strict packet |
| `approval_packet_surface` | Founder decision required | L0 strict packet |
| `deploy_packet_surface` | Deploy/manual bridge/provider truth | L0 strict packet |
| `manual_bridge_surface` | Manual action instructions for provider | L1 semi-structured |
| `monitoring_surface` | Post-deploy status | L1 semi-structured |
| `exception_surface` | Structured failure, not raw internal leak | L0 strict packet |
| `evidence_surface` | Proof refs, audit trail | L1 semi-structured |

### Executive Surfaces
| Surface Type | Description | Freedom Level |
|---|---|---|
| `executive_kickoff_surface` | Project start alignment and intake | L1 semi-structured |
| `executive_status_surface` | Executive status rollup | L1 semi-structured |
| `decision_packet_surface` | Rendered deliberation result | L0 strict packet |
| `structured_command_surface` | Briefs, reports, bulk command results | L1 semi-structured |
| `query_surface` | Stored plan/work/decision lookups (rendered, not raw) | L1 semi-structured |

### Freedom Levels
- **L0 strict packet**: Fixed template, no free-form body. approval/deploy/execution packets.
- **L1 semi-structured**: Template envelope + structured content sections.
- **L2 bounded narrative**: Template envelope + controlled expressive body (e.g. discovery dialogue).
- **Forbidden**: L∞ free-form raw internal text.

---

## 6. Single Inbound Pipeline

```
founderRequestPipeline({ text, metadata, route_label })
  1. workObjectResolver(text, metadata)        → { project_space?, run?, intake?, phase_hint }
  2. workPhaseResolver(workContext, text, meta) → { phase, phase_source, confidence }
  3. classifyFounderIntent(text, metadata)      → { intent, signals } (supplementary signal)
  4. policyEngine(actor, workCtx, phase, signal)→ PolicyDecision
  5. routeToExecutor(phase, policy, text, meta) → executor result payload
  6. packetAssembler(executorResult, workCtx)   → founder-facing packet
  7. founderRenderer(surfaceType, packet)        → { text, blocks? }
```

If the pipeline fully resolves, the response is final.
If the pipeline returns `null`, legacy routers handle the request — migration-period only.

Work object resolution is the **first** step: "Which project/run/session does this turn belong to?"
Intent classification is a **supplementary signal** to the policy engine.

---

## 7. Single Outbound Pipeline

```
founderOutbound.send({ channel, thread_ts, rendered_text, rendered_blocks, surface_type, trace })
```

This is the **only** function that may post founder-facing text to Slack.

Internal steps:
1. Contract validation: `surface_type` must be in the registry.
2. Hard block check: scan for forbidden internal markers.
3. If markers found → replace with `safe_fallback_surface` text.
4. Slack API call.
5. Emit `founder_output_trace` log.

Forbidden direct calls: `say()`, `respond()`, `replyInThread()`, `client.chat.postMessage()` with raw text.

---

## 8. Failure Policy

**Fail closed**, but distinguish exploratory from invalid.

| Stage | Failure | Result |
|---|---|---|
| Work object resolution | No matching object + exploratory input | `discovery_surface` |
| Work object resolution | No matching object + invalid/unsafe input | `safe_fallback_surface` |
| Phase resolution | Ambiguous phase | `discovery_surface` (COS asks) |
| Policy engine | Denied capability | `exception_surface` with explanation |
| Executor | Throws/timeout | `safe_fallback_surface` with error trace |
| Packet assembler | Missing required fields | `exception_surface` |
| Renderer | Missing template | `safe_fallback_surface` |
| Outbound | Internal markers detected | Hard block → replacement text |

---

## 9. Logging / Trace Policy

Every founder-facing response emits a `founder_output_trace` JSON log:

```json
{
  "stage": "founder_output_trace",
  "inbound_turn_id": "...",
  "work_object": { "type": "execution_run", "id": "..." },
  "work_phase": "execute",
  "intent_signal": "unknown",
  "policy": { "allow": true, "required_surface_type": "run_state_surface" },
  "surface_type": "run_state_surface",
  "responder_kind": "pipeline",
  "route_label": "mention_ai_router",
  "passed_pipeline": true,
  "passed_outbound_gate": true,
  "contains_internal_markers": false,
  "rendered_preview": "..."
}
```

---

## 10. Migration Plan — Golden Path First

**Big-bang forbidden. But "small intents first" is also forbidden.**

Migration target: one complete founder-visible golden path first.

```
Founder kickoff request
→ discovery / alignment (discover/align phase)
→ scope lock (lock phase)
→ project space creation/reuse
→ execution run creation (seed phase)
→ execution packet + dispatch (execute phase)
→ approval packet (approve phase)
→ deploy packet (deploy phase)
→ founder next action (monitor phase)
```

This entire path moves into the new pipeline first.
Meta/utility (version, help, meta_debug) live alongside as phase-less utility routes.

After the golden path is stable:
- Structured commands (계획등록, 업무등록) migrate next.
- Query lookups migrate with renderer enforcement.
- Council deliberation migrates with object-only enforcement.

Legacy routers remain as thin adapters during migration. No new regex. No new founder-facing strings.
