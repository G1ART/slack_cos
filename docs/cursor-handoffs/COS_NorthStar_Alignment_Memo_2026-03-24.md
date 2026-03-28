# COS North Star Alignment Memo — Fastest Path Interpretation (for Cursor)

**Authority role:** Build-order lock

**Can define:**

- next milestone order
- what counts as aligned progress
- what is not next

**Cannot override:**

- Directive on product truth

**Use when:**

- choosing next patch
- resolving sequencing disputes

---

**Date:** 2026-03-24  
**Purpose:** Remove ambiguity, lock the implementation order, and prevent detours.

---

## 레포 삽입 메타 (Cursor / 사람용)

- 본문 **§0–§18**은 ChatGPT·사용자 합의 **원문(영문)** 을 보존한다.
- **아키텍처 리셋 파일명 정정**: 외부 초안 `Slack_COS_Architecture_Reset_Handoff_2026-03-22.md` → **이 레포의 정본은** `COS_Slack_Architecture_Reset_2026-03.md`.
- **권위 순서의 한글 요약**은 `COS_Project_Directive_NorthStar_FastTrack_v1.md` **§1c**에 두고, 충돌 시 **하위 문서가 패배**한다.
- **`COS_NorthStar_ReLock_Directive_2026-03.md`**: 실행 서사·체크리스트 **지원·보존**용. 빌드 오더·주진척 판단은 **본 Memo + 디렉티브 §1c**가 이긴다.
- **비판적 검토(논쟁 포인트)**: 맨 아래 **§19 (한국어)** 참고.
- **동반 정본 (하네스·Anthropic 교훈·번역 맵·M5a/b·M6)**: `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` — 순서가 어긋나면 **본 Memo + 디렉티브 §4** 우선.

---

## 0. Read this first

This memo is a **strategic alignment correction**, not a generic brainstorm.

You already did useful recovery work.
The repo is not lost.
The core direction is right.

But from this point forward, the main risk is **not lack of ideas**.
The main risk is **building the wrong next thing in the wrong order**.

This memo exists to eliminate that risk.

---

## 1. Authority order — do not improvise beyond this

When documents disagree or create emphasis tension, follow this order:

1. `COS_Project_Directive_NorthStar_FastTrack_v1.md`
2. `COS_Slack_Architecture_Reset_2026-03.md` *(external draft name was `Slack_COS_Architecture_Reset_Handoff_2026-03-22.md` — same role)*
3. `COS_Inbound_Routing_Current_260323.md`
4. `COS_NorthStar_Workflow_2026-03.md`
5. `COS_OpenClaw_Vision_Roadmap_2026-03.md`
6. `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md`

Interpretation rule:

- The **Directive** defines product truth and non-negotiables.
- The **Architecture Reset** defines product-layer interpretation.
- **Inbound Routing** defines current runtime truth.
- **Workflow** explains intended operating model.
- **Roadmap** explains code gap and recommended build sequence.
- **Handoff** is the implementation ledger, not the product constitution.

If anything in a lower document pulls toward command sprawl, slash-first expansion, scheduler-first work, hosted-first work, or persona-polish-first work, and that conflicts with the Directive, the lower document loses.

---

## 2. What the product actually is

Do not reduce this project to:

- a Slack bot,
- a router,
- a planner,
- a council wrapper,
- a slash-command shell,
- or a collection of commands.

The product is:

**A Slack-based COS operating system where the CEO speaks mostly to one super-capable COS in natural language, and COS orchestrates multi-agent work, external tools, approvals, records, and long-running loops with transparency and minimal executive friction.**

The intended end-state is:

- **one executive-facing surface**
- **many hidden internal operating APIs**
- **multi-agent orchestration behind COS**
- **full drill-down transparency when requested**
- **24/7 semi-autonomous execution after scope closure**
- **decision-heavy executive interaction, not command-heavy interaction**

This means:

The CEO is **not** the operator of the machine.
The CEO is **not** the PM for every micro-step.
The CEO is **not** expected to remember prefixes and exact command syntax.
The CEO is **not** expected to talk to each agent separately.

The CEO should mostly interact with:

- goals
- priorities
- constraints
- decisions
- holds
- approvals
- status asks
- strategic/risk review asks

Everything else should be internal machinery.

---

## 3. What is already aligned

Do not underrate the current repo.

The current codebase already has meaningful Layer A assets:

- Slack runtime front door
- top-level inbound separation
- query-only route
- planner hard lock
- structured command layer
- surface intent layer (partial)
- dialog/Council split
- conversation buffer
- work/work-run model
- GitHub thin slice
- Cursor handoff/result intake bridge
- approval queue
- logs/briefs/decision artifacts
- storage abstraction direction
- hosted/env readiness scaffolding

This is not a blank project.
This is not “we still need to start.”
This is **a control-plane-heavy v0**.

That matters because the next work should **not** be “invent a new architecture.”
The next work should be:

- reduce ambiguity,
- formalize the executive interaction object,
- add observability spine,
- then attach orchestration.

---

## 4. What is still fundamentally missing

Even after the recent document improvements, the real North Star is still blocked by four missing layers.

### Missing layer 1 — trace/correlation spine

There is no true turn-to-turn correlation spine that can answer:

- what COS saw,
- what route it took,
- what it rendered,
- which packet/work/run/approval it touched,
- and how to inspect it later.

Console logs are not enough.
Ad hoc logs are not enough.
Fixture-only previews are not enough.

Without this, transparency is a philosophy, not a product capability.

### Missing layer 2 — decision packet as first-class object

The product says “GOAL-IN / DECISION-OUT,” but there is still no real packet object that lets COS:

- present bounded options,
- recommend one,
- attach risk/time/cost/reversibility,
- and map a short reply like “2안으로 가자” or “보류” back to a stable object.

Without this, the CEO still ends up operating flow through command vocabulary or long discussion.

### Missing layer 3 — explicit approval matrix

Approval queue exists.
Approval philosophy exists.
But approval policy is still not formal enough.

Without a real matrix, the product will oscillate between:

- asking too often,
- or acting too boldly.

Both are unacceptable.

### Missing layer 4 — agent work queue / autonomous loop seed

We have work items, runs, and adapters.
But we do not yet have the minimum orchestration object that says:

- this approved unit is now enqueued,
- this agent/tool is responsible,
- this is the lifecycle,
- these are the artifacts,
- this is the proof,
- this is the blocker or next step.

Without this, “24/7 company-like operation” remains an aspiration, not a runtime behavior.

---

## 5. The biggest strategic ambiguity that must be resolved now

There is still one ambiguity in the docs:

- one axis says the next North Star milestone is **Decision packet + Approval matrix**
- another axis says the first fastest-path foundation is **Trace / correlation**

Do **not** treat those as competing roadmaps.
Do **not** choose one and postpone the other by a long distance.

The correct interpretation is:

## Milestone M2 = one composite milestone

- **M2a: Minimal trace spine**
- **M2b: Decision packet + approval matrix foundation**

Why this is the correct interpretation:

1. If you build packet without trace, transparency and inspectability stay fake.
2. If you build trace without packet, you risk drifting into infrastructure work with no executive UX breakthrough.
3. The right move is to build the smallest trace spine that directly supports packet lineage, policy evaluation, and later work queue linking.

So:

- trace is the **structural prerequisite**
- packet is the **first executive-visible win**
- approval matrix is the **control system that makes autonomy tolerable**

Treat them as one milestone, not three unrelated epics.

---

## 6. What “fastest path” means here

“Fastest path” does **not** mean:

- whichever patch is easiest,
- whichever patch creates the most visible UI,
- whichever patch adds the most commands,
- whichever patch is most benchmark-like on the surface,
- whichever patch makes slash/buttons look cooler.

“Fastest path” means:

- shortest route to the real executive experience,
- shortest route to transparent autonomy,
- shortest route to low-friction control,
- shortest route to real trust.

That means the following are **not** the next main milestone:

### Not next:

- broad `/g1cos` expansion
- command alias sprawl
- more help text
- scheduler/auto-push briefs as primary milestone
- hosted/apply work as primary milestone
- Supabase-first expansion as primary milestone
- multi-persona style polish as primary milestone
- matrix threshold tuning as primary milestone
- general channel ingestion as primary milestone

Those may all be useful later.
None of them are the shortest path to the actual North Star.

---

## 7. Direct correction to the current framing

### 7.1 About `/g1cos`

`/g1cos` already exists as a query MVP.
Do not remove it.
Do not celebrate it as core progress either.

Interpret it correctly:

- it is an **exceptional early transport shell**
- it is **not** the model
- it is **not** the product center
- it must remain subordinate to packet/approval/trace
- its expansion belongs after the packet/trace/control model is stable

### 7.2 About `프로젝트시작:` and other prefixes

These are acceptable as transitional canonical forms.
They are **not** the desired final UX.

You must code with this end-state in mind:

- the CEO should eventually be able to say  
  “더그린 아뜰리에 예약 캘린더 MVP 만들자”
  and have it resolve to a `start_project` surface intent
- without requiring a visible prefix ritual

So:

- keep canonical command forms internally
- do not design the product around the assumption that the CEO will keep typing prefixes forever

### 7.3 About transparency

Transparency is not “we have logs somewhere.”
Transparency means the CEO can later ask:

- “방금 왜 2안을 추천했지?”
- “이 작업에 어떤 에이전트/툴이 개입했지?”
- “지난 몇 시간 동안 뒷단에서 무슨 일이 있었지?”
- “이 일은 왜 아직 안 끝났지?”

and COS can answer from packet/work/run/trace lineage, not from vibes.

### 7.4 About Council

Council is useful.
But uncontrolled Council behavior is one of the fastest ways to kill momentum.

Design assumption:

- normal execution flows should not feel like Council
- normal status should not feel like Council
- normal packet prep should not feel like Council
- Council should appear only when explicitly requested or internally necessary for packet preparation

---

## 8. The real executive frustration model — build against this, every patch

From now on, each patch must reduce at least one of these:

### A. “왜 또 내가 문법을 맞춰줘야 하지?”

If the CEO must remember specific prefixes, command order, or internal workflow language, you are failing.

### B. “지금 필요한 건 진행인데 왜 자꾸 분석으로 흐르지?”

If execution moments drift into long strategic prose or abstract review, you are failing.

### C. “지금 나한테 필요한 건 결정인데 왜 상태 덤프를 보여주지?”

If status feels like internal object spam instead of executive decision support, you are failing.

### D. “에이전트가 많은데 왜 내가 아직도 PM처럼 붙어 있어야 하지?”

If the system keeps escalating too many minor choices, you are failing.

### E. “완료라고 하는데 뭐가 실제로 끝난 건지 증거가 없네?”

If completion lacks artifact-linked proof, trust will collapse.

This model is not commentary.
It is a build-time acceptance lens.

---

## 9. What “aligned” means from this point forward

A patch is aligned only if it strengthens one or more of these:

1. CEO speaks in goals/decisions, not machine grammar
2. COS reduces cognitive load, not increases it
3. internal APIs become less visible at the surface
4. decision packets become more central
5. approvals become more policy-driven
6. transparency becomes more inspectable
7. execution becomes more autonomous without losing control
8. completion becomes more evidence-backed

A patch is misaligned if it mostly does any of these:

- adds surface commands
- expands slash before packet/trace
- over-polishes Council
- expands command syntax edge-case handling as primary value
- focuses on infra migration without executive UX leverage
- adds more docs without closing one runtime gap

---

## 10. Current North Star distance — honest reading

Do not fake a percentage.
Do not say “we are 70% there” or anything like that.

A truthful statement is:

- **Core identity alignment**: strong
- **Executive-facing interaction maturity**: still early
- **Transparent autonomy maturity**: still early
- **OpenClaw-class operational maturity**: still clearly incomplete

In other words:

- Layer A is meaningfully built
- Layer B is partially formed
- Layer C is not yet real enough

That is the honest status.

---

## 11. Concrete build order — locked

## Milestone M2a — Minimal trace spine

This is the smallest possible observability foundation that directly supports the next packet/control work.
It must not become a general logging platform project.

### Deliverables

1. `turn_id`
2. `thread_key`
3. append-only trace write on each inbound turn
4. `final_responder`
5. `surface_intent` if available
6. `command_name` if structured
7. `packet_id` nullable
8. `plan_id` nullable
9. `work_id` nullable
10. `run_id` nullable
11. `approval_id` nullable
12. duration / error / channel / user_id
13. trace write path that works in local runtime first
14. tests proving trace file/store receives records

### Design constraints

- use a small, boring format
- JSONL is fine
- Supabase can wait unless very small to add
- no analytics dashboards
- no giant telemetry framework
- no speculative schema explosion

### Direct purpose

This exists so that packet, approval, work queue, and drill-down can all hook into a stable lineage backbone.

---

## Milestone M2b — Decision packet + approval matrix foundation

This is the first real executive UX milestone.

### Deliverables

1. `decisionPacket` schema
2. renderer for Slack text first
3. short reply parser:
   - `1안`
   - `2안`
   - `2안으로 가자`
   - `더 빠른 쪽`
   - `비용 적은 쪽`
   - `보류`
4. packet-to-reply resolution
5. `statusPacket` schema
6. status rendering default:
   - 진행 변화
   - 현재 막힘
   - 대표 결정 필요
   - COS 다음 자동 액션
   - 근거/증거
7. approval matrix typedef
8. `evaluateApprovalPolicy(input)` stub returning:
   - `auto_allowed`
   - `cos_approval_only`
   - `executive_approval_required`
9. hook point where packet generation and approval evaluation can coexist
10. packet IDs recorded in trace

### Design constraints

- text first, buttons later
- schema first, clever LLM behavior later
- deterministic mapping over fuzzy behavior where possible
- do not over-engineer cost/time estimation
- simple estimation fields are enough for v1

### Direct purpose

This exists to change the CEO experience from:

- command operation
to:
- bounded, high-trust decision-making

---

## Milestone M3 — Agent work queue seed

Do not start here before M2a/M2b.

### Deliverables

1. approved/authorized unit enqueue
2. queue item lifecycle
3. link queue item to packet/work/run
4. adapter reuse for Cursor/GitHub/etc.
5. progress/proof summarization back to Slack
6. blocker/escalation state
7. minimum closure semantics

### Design constraint

This is a seed, not full autonomous civilization.
Use current work/run/adapters.
Do not build a giant DAG engine first.

---

## Milestone M4 — transport shell

Only after M2 and early M3 are stable:

- `/g1cos` expansion
- packet buttons
- approval buttons
- status refresh buttons

Buttons/slash must consume the packet/trace/control model.
They must not bypass it.

---

## 12. Files / modules likely involved next

This is not a rigid list, but a likely map.

### For M2a

- `app.js` or the main inbound entry where trace can be wrapped
- `src/features/runInboundCommandRouter.js`
- `src/features/runInboundAiRouter.js`
- new trace helper, e.g.:
  - `src/features/turnTrace.js`
  - or `src/runtime/turnTrace.js`
- storage path helper for trace file
- tests / replay fixtures

### For M2b

- new packet schema module, e.g.:
  - `src/features/decisionPackets.js`
  - `src/features/statusPackets.js`
  - `src/features/approvalPolicy.js`
- surface intent / dialog / navigator integration points
- Slack rendering helpers
- decision reply parsing helper
- tests for parser / packet render / policy evaluation

### For later M3

- queue model extension around current work/run layer
- adapter reuse hooks
- policy-aware dispatch boundary

---

## 13. Specific no-go lines for the next patch

Do **not** do the following in the next patch:

1. do not expand `/g1cos` into a larger user-facing command surface
2. do not add many new natural-language aliases as the main output
3. do not prioritize scheduler/brief auto-push
4. do not prioritize hosted deployment/apply
5. do not prioritize Supabase promotion as the main story
6. do not spend the patch on multi-persona prompt tuning
7. do not make Council richer before packet/control are real
8. do not return with “more docs” but no new runtime contract
9. do not claim packet exists if it is only a formatted paragraph with no stable ID
10. do not claim trace exists if it is only ad hoc console prints

---

## 14. UX contract you must design toward

### Executive end-state

The CEO should be able to mostly say things like:

- “Abstract onboarding MVP 다시 정리해보자”
- “지금 상태 보여줘”
- “2안으로 가자”
- “이건 보류”
- “staging 통과하면 준비해”
- “이 결정 왜 추천했는지 보여줘”
- “지난 6시간 동안 뒷단에서 뭐 했나 보여줘”

### COS should answer with

- alignment summary
- decision packet
- status packet
- approval request
- blocked-by explanation
- proof-linked completion summary
- drill-down explanation on request

### COS should not default to

- raw internal command prompts
- giant Council essays
- object dumps
- “please use this exact syntax” coaching
- vague “working on it” without lineage or proof

---

## 15. Completion / proof policy

From now on, every “done” or “completed” claim should be proof-aware.

Minimum acceptable proof types:

- file path
- handoff path
- run_id
- work_id
- packet_id
- approval_id
- issue/PR URL
- test result
- trace record reference
- artifact summary

Do not say:

- “완료했습니다”

unless there is a machine-checkable or artifact-checkable basis.

---

## 16. How to report progress after the next patch

After the next patch, report in this exact structure:

1. What North Star gap this patch closed
2. Which executive frustration(s) it reduced (A/B/C/D/E)
3. What new runtime contracts now exist
4. What files changed
5. What schemas were introduced
6. What was intentionally left out
7. Tests executed
8. Manual Slack smoke cases executed
9. Remaining risks
10. What the next patch should be
11. Copy-paste commands for owner
12. Handoff/docs updated

Additionally:

- clearly state whether this patch belongs to **M2a**, **M2b**, or both
- if both, say how packet and trace are linked

---

## 17. Immediate task you should do now

Your next move is **not** to implement everything in this memo.

Your next move is:

### TASK

Propose the exact next patch for:

- **M2a minimal trace spine**
and, if scope allows without dilution,
- the first thin slice of **M2b packet foundation**

Your response must include:

1. why this is the highest-leverage next step
2. why slash expansion is not the next step
3. why hosted/scheduler/storage work is not the next step
4. exact files to create/modify
5. exact runtime contract to add
6. exact acceptance criteria
7. exact tests
8. exact no-go lines
9. handoff updates required

If you cannot do M2a + M2b together cleanly, choose **M2a first**, but explicitly show how it unblocks M2b immediately after.

---

## 18. Final interpretation sentence — pin this mentally

We are not trying to build a smarter command bot.

We are trying to build:

**a transparent, decision-centric, Slack-native COS operating system whose internal machinery disappears behind one executive-facing mind.**

Everything you do next must move the repo closer to that sentence.

---

## 19. Appendix — 비판·검토 (한국어, Cursor·사람 공유)

### 19.1 권위 순서에 대한 이의 제기 가능 지점

- **#2 Architecture Reset vs #3 Inbound Routing**: Reset은 “제품 층·역사적 원인” 해석에 강하고, Inbound는 “지금 코드가 실제로 분기하는 것”에 강하다. **런타임 버그·회귀 원인**을 따질 때는 #3을 우선 열어도 된다 — 단, **제품 방향을 바꿀 명분**으로 Reset을 무시하면 안 된다는 뜻이다.
- **Roadmap(#5) vs Directive(#1)**: 로드맵은 “갭·추천 순서”; 디렉티브와 충돌하면 로드맵을 고친다.

### 19.2 M2a + M2b “합성” vs 패치 단위

- 메모는 **한 마일스톤(M2)** 으로 묶지만, **한 PR에 억지로 다 넣으면** 흐려질 수 있다.
- **실무 권장**: 첫 구현은 **M2a만**으로 끝내고, 스키마에 `packet_id` **nullable 슬롯**만 열어 두면 M2b가 바로 얹힌다 — 메모 §5.3과 모순 없음.

### 19.3 영문 본문 vs 한글 핸드오프

- 정밀 해석·no-go·보고 형식은 **본 메모(영문) 절**을 우선한다.
- 디렉티브·North Star 워크플로는 **한글 운영**을 유지한다.

### 19.4 사용자 가이드와의 긴장

- `COS_Operator_QA_Guide_And_Test_Matrix.md` 는 운영·QA에게 `계획상세` 등을 안내한다 — **제품 헌법(디렉티브)과 역할이 다르다**. Alignment §2·§7과 함께 보며, 권위 맵은 `00_Document_Authority_Read_Path.md`.
