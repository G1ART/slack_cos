# COS North Star Re-Lock Directive — Executive MVP Definition & Fastest Path

**2026-03**

**Authority role:** Supporting / preserved narrative (not in the document hierarchy)

**Can define:** long-form rationale, checklist habits, historical patch-report structure.

**Cannot override:** Directive §1c, Alignment Memo, Inbound Routing.

**Use when:** you want the original Re-Lock essay and §6–§7-style reporting reminders — **after** Directive + Alignment. If anything here disagrees with those, **ignore this file**.

---

**Purpose (historical):** capture MVP definition and narrative guardrails so teams do not drift into transport-only stories, command sprawl, or infra-for-its-own-sake.

**Status:** **Superseded for authority** by `COS_Project_Directive_NorthStar_FastTrack_v1.md` §1c (execution narrative summary) and `COS_NorthStar_Alignment_Memo_2026-03-24.md` (build order). This file remains as **supporting material** only.

**큰 그림(왜 회사 창업 급인가 · harness → 슬랙 COS 워크스페이스):** `COS_Workspace_Vision_CompanyScale_2026-03.md`

---

You are not building a Slack bot, command maze, or agent demo shell.

You are building a Slack-native COS operating system where:

- the CEO speaks mostly to one super-capable COS in natural language
- COS orchestrates multi-agent work, external tools, approvals, records, and long-running loops behind the scenes
- the executive-facing surface stays minimal and decision-centric
- internal planner / work / run / approval / GitHub / Cursor / storage layers remain internal operating APIs
- the CEO is NOT the operator of the machine, NOT the PM for every micro-step, and should NOT need to remember exact syntax

## 1. Product truth to preserve

The target product is:

- GOAL-IN / DECISION-OUT
- one executive-facing surface
- many hidden internal operating APIs
- multi-agent orchestration behind COS
- drill-down transparency when requested
- semi-autonomous continuation after scope closure
- decision-heavy executive interaction, not command-heavy interaction

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

## 2. Hard build-order lock

Do NOT treat current progress as “we are now mainly building M4.”  
The correct order is locked:

- **M2a** = minimal trace spine
- **M2b** = decision packet + approval matrix foundation
- **M3** = agent work queue seed
- **M4** = transport shell only
- **M5** = hardening / persistence / platform consistency
- **M6+** = domain products on top of the substrate

Interpretation:

- M2a and M2b are one composite milestone
- trace without packet = infra drift
- packet without trace = fake transparency
- approval without trace/packet = abstract policy
- M4 is NOT the main story; it is a thin shell that consumes packet / approval / trace / work lineage

## 3. What counts as real progress from now on

A patch only counts as **primary** progress if it directly strengthens one or more of these:

1. trace / correlation spine
2. decision packet / short reply / status packet
3. approval matrix / control boundary
4. approved-unit queue / lifecycle / proof / blocker / escalation
5. proof-linked completion and drill-down transparency

Do NOT count the following as **main** progress unless they directly consume the above runtime objects:

- `/g1cos` expansion
- more command aliases
- buttons as surface-first work
- scheduler / brief auto-push
- hosted / apply work
- Supabase-first migration as the story
- persona prompt tuning
- Council polish before packet/control are real
- more docs without a new runtime contract

## 4. Correct use of Anthropic / harness patterns

Harness-style patterns are useful for:

- planner / builder / evaluator split
- handoff artifacts
- done contracts
- tool-based evaluation
- incremental persistence
- worker runtime discipline
- proof-linked completion

But these patterns belong in the **hidden worker/runtime layer**, not as executive-facing surface UX.

Do NOT:

- make slash the center because of agent demos
- expose more agent internals to the CEO
- build a giant DAG / distributed workflow empire before approved-unit queue seed
- import Anthropic patterns in a way that replaces COS-first executive UX

Use the pattern. Keep our product vocabulary.

## 5. MVP definition to optimize for

The high-quality MVP is NOT:

- a bigger command surface
- a prettier shell
- a benchmark-like agent demo
- a control-plane with no executive trust object

The MVP we are optimizing toward is:

- a real executive decision interface
- transparent enough to trust
- structured enough to continue work semi-autonomously
- strict enough to prove what happened
- minimal enough to keep the executive surface clean

That means the executive UX must converge toward:

- alignment summary
- decision packet
- status packet
- approval request
- blocked-by explanation
- proof-linked completion summary
- drill-down explanation on request

Default failure modes to actively avoid:

- forcing syntax
- stopping at analysis
- dumping internals
- over-asking approval
- claiming done without proof

**Owner loop (KO, 2026-03-27):** The product owner’s four-part MVP statement (lock-in → traceable build → deploy/feedback → multi-purpose reuse) is canonically captured in **`COS_MVP_Definition_Owner_2026-03-27.md`**. This section remains the English qualitative checklist; build-order still follows **Alignment Memo**.

## 6. Immediate next target

Your next target is NOT broad M4 work.

Your next target is:

- finish / verify **M2a** minimal trace spine
- complete the first **real** slice of **M2b**
- only then advance **early M3** queue seed that reuses existing work/run/adapters

### Minimum required for “M2a + first real M2b” acceptance

- append-only inbound trace record per turn
- stable `turn_id`
- `thread_key`
- `final_responder`
- nullable linkage fields for packet / plan / work / run / approval
- tests proving records are written
- real `decisionPacket` schema with stable `packet_id`
- bounded options
- recommendation
- short reply parser for:
  - `1안`
  - `2안`
  - `2안으로 가자`
  - `더 빠른 쪽`
  - `비용 적은 쪽`
  - `보류`
- packet-to-reply resolution
- `statusPacket` schema
- `approvalMatrix` typedef and `evaluateApprovalPolicy()` stub returning:
  - `auto_allowed`
  - `cos_approval_only`
  - `executive_approval_required`
- packet IDs recorded in trace

### Only after that

- early M3 approved-unit enqueue
- queue lifecycle
- link queue item to packet / work / run
- adapter reuse for Cursor / GitHub / etc.
- progress / proof summary back to Slack
- blocker / escalation state

## 7. Mandatory patch reporting format

For every patch, report all of the following:

1. Which North Star gap it closes  
   - trace spine  
   - decision packet  
   - approval matrix  
   - work queue seed  
   - proof / drill-down  
2. Which locked milestone it belongs to  
   - M2a / M2b / M3 / M4 / M5  
3. Which executive frustration it reduces  
   - syntax burden  
   - analysis stall  
   - internal dump  
   - over-approval  
   - proofless completion  
4. What new **runtime contract** now exists  
5. What exact **proof/checks** exist  
6. What is still intentionally **NOT** solved yet  

Do not claim “done” unless artifact-checkable proof exists.

## 8. Handoff discipline

At the end of every patch:

- update the relevant handoff / directive-facing doc briefly and clearly
- record what changed
- record what remains
- record the next recommended patch
- include exact owner actions, if any
- include exact local run / test commands, if any
- include exact git commands, if needed

## 9. Final instruction

Do not optimize for “something flashy in Slack.”  
Do not optimize for “more commands.”  
Do not optimize for “benchmark resemblance.”

Optimize for the shortest route to:

- real executive trust
- bounded decision-making
- transparent autonomy
- proof-linked execution
- a substrate that can later build real apps/products/modules

**This is the product. Hold the line.**

---

## 레포 정합 메모 (코드 스냅샷 — 갱신 시 본 절만 패치)

| Re-Lock §6 항목 | 코드·테스트 힌트 (현재 레포) | 갭 |
|------------------|-------------------------------|-----|
| M2a trace | `src/features/inboundTurnTrace.js`, `data/inbound-turn-trace.jsonl`, `scripts/test-inbound-turn-trace.mjs` | 필드·링크 완전성·회귀 범위를 Re-Lock 수용 기준에 맞춰 **검증** |
| M2b decision packet | `src/features/decisionPackets.js`, `parseDecisionShortReply`, `scripts/test-decision-packet.mjs` | 심화: PLN/WRK 롤업·승인 큐와 본문 연동 |
| M2b status packet | `src/features/statusPackets.js`, `data/status-packets.jsonl`, trace `status_packet_id`, `scripts/test-status-packet.mjs` | 스토어 실데이터·lineage 토큰 `STP-…` 드릴다운 |
| M2b approval matrix | `src/features/approvalMatrixStub.js`, `evaluateApprovalPolicy`, AWQ `approval_policy_tier` | typedef·문서·trace 연계 **명시적** 정리 |
| M3 queue | `src/features/agentWorkQueue.js`, 구조화 `워크큐*` | Re-Lock상 **M2a+M2b 수용 후** “주진척”으로만 카운트 |
| M4 transport | `g1cosLineageTransport.js`, `/g1cos` | **얇은 껍데기**로만; 단독 스토리 금지 |
| Proof / drill-down | `proof_refs`, CI 훅 선택 | executive trust 객체와 **명시적 연결**될 때만 주진척 |

**다음 권장 패치 (Re-Lock 기준):** M2a 레코드·필드·테스트를 §6 체크리스트와 1:1 대조하고, M2b에서 **statusPacket 스키마 + trace의 `packet_id` 기록**을 “첫 실제 슬라이스”로 닫은 뒤에만 M3를 확장한다.
