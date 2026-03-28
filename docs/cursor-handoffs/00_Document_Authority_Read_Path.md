# Document authority — one-page read path (not a new North Star)

(한국어) **한 줄:** Slack **Big Pivot** COS 런타임에서 의사결정 표면·감사·실행 브리지를 코드로 굳히는 레포다. 이 파일은 **어느 문서가 이기는지**만 고정한다.

**One-line purpose (EN):** This repo hardens a Slack-native **Big Pivot** COS runtime: decision surface, audit, and execution bridges in code. This file only fixes **which document wins**, not philosophy.

**Read this file first.**

---

## Default read set (minimal — start here)

For almost every patch, **only**:

1. **`COS_Project_Directive_NorthStar_FastTrack_v1.md`** — product constitution  
2. **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** — build-order lock  

**Only if needed** (do not stack by default):

- **Runtime truth:** `COS_Inbound_Routing_Current_260323.md` (or newest `COS_Inbound_Routing_Current_*.md`) — when routing/code behavior is in question  
- **Patch context:** a current `WRK-*.md` or task brief — when the change is scoped to one initiative  

That is the **intended reading burden**. Everything below is **reference**, not part of the default stack.

---

## Full reference hierarchy (when you need the whole map)

For **actual routing/code behavior**, **`COS_Inbound_Routing_Current_*.md`** wins over interpretive docs.

When documents disagree on emphasis, **this order wins** (higher beats lower). The numbered list **1–7** below matches **`COS_Project_Directive_NorthStar_FastTrack_v1.md` §1c** items **1–7** (same documents, same order).

1. `COS_Project_Directive_NorthStar_FastTrack_v1.md` — product truth, non-negotiables  
2. `COS_NorthStar_Alignment_Memo_2026-03-24.md` — milestones, no-go, aligned progress  
3. `COS_Slack_Architecture_Reset_2026-03.md` — product/system reading of the repo  
4. `COS_Inbound_Routing_Current_260323.md` — **current** branch behavior  
5. `COS_NorthStar_Workflow_2026-03.md` — short operating model  
6. `COS_OpenClaw_Vision_Roadmap_2026-03.md` — gap / asset map (sequencing still follows Alignment)  
7. `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` (repo root `docs/`) — implementation ledger only  

| Doc | Role |
|-----|------|
| Directive | Product constitution |
| Alignment Memo | Build-order lock |
| Architecture Reset | Product/system interpretation |
| Inbound Routing | Runtime truth |
| Workflow | Onboarding / summary |
| Roadmap | Gaps and assets |
| Handoff v2 | What was built (not constitution or runtime) |

---

## Supporting documents (no seat in the hierarchy)

These **do not** override Directive, Alignment, or Inbound Routing. Use for history, rationale, or extra structure.

| Doc | Role |
|-----|------|
| `COS_NorthStar_ReLock_Directive_2026-03.md` | **Supporting snapshot** — same narrative themes (M2 emphasis, M4 as transport shell, patch-report habits) are **summarized in Directive §1c** and detailed in **Alignment**; if this file disagrees with Directive or Alignment, **ignore this file** |
| `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` | Harness translation / discipline map |
| `COS_FastTrack_v1_Surface_And_Routing.md` | Surface vs internal API contract (conflicts → Inbound Routing + Directive) |
| `COS_Workspace_Vision_CompanyScale_2026-03.md` | End-state / investment framing |
| `COS_MVP_Definition_Owner_2026-03-27.md` | **Owner MVP loop (KO, 4 items)** — product outcome definition cited from Directive §1b; does **not** override Alignment build-order |
| `COS_Execution_Worker_Layer_CloudFirst_v1.md` | **Cloud-first worker** — COS vs L2 릴레이 vs Cursor Cloud/GitHub worker · 대표/엔지니어링 액션 (does **not** override Inbound Routing) |
| `COS_Agent_Bridge_Outbound_v0.md` | `COS_AGENT_BRIDGE_*` 페이로드·인바운드 `ci-proof` 요약 |

---

## Do not treat as product truth

- Operator / QA — `COS_Operator_QA_Guide_And_Test_Matrix.md`  
- Regression notes — `Regression_Harness_slack_fixtures.md`, etc.  
- WRK / one-off memos  
- Pathway / harness docs (discipline only)  

---

## Anti-drift (one line)

If a lower doc pushes **command sprawl**, **slash/button-first**, **hosted-only**, **scheduler-first**, or **persona-polish-first**, that push **loses**. Shape from Directive; order from Alignment; current behavior from Inbound Routing.

---

## Rules for any new document

Every new `.md` must declare:

- **Authority role:**  
- **Can define:**  
- **Cannot override:**  
- **Use when:**  

Permanent bans (document governance):

- Claiming to be the **single source of product/build/runtime truth** if you are outside the **full reference hierarchy** above  
- Redefining **product truth** outside Directive  
- Redefining **build order** outside Alignment  
- Redefining **current runtime** outside Inbound Routing  

---

## Quick link

- Surface/routing contract: `COS_FastTrack_v1_Surface_And_Routing.md` — read beside runtime; **Inbound Routing + Directive win** on conflicts.
