# COS North Star Implementation Pathway — Anthropic Harness-Informed Fast Track

**Authority role:** Harness translation note

**Can define:**

- how Anthropic/harness patterns map into our hidden runtime layer
- artifact and worker discipline suggestions

**Cannot override:**

- Directive
- Alignment
- Runtime truth

**Use when:**

- translating harness ideas into internal runtime discipline

---

**2026-03**  
**Purpose:** Lock the shortest path to the real North Star, integrate useful lessons from Anthropic-style harness / long-running agent work, and prevent slash-first / command-first / infra-first detours.

**주진척·서사 고정:** **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** 와 디렉티브 **§1c 부속**. (선택) 장문·체크리스트: **`COS_NorthStar_ReLock_Directive_2026-03.md`** — 지원 문서이며 권위 없음.  
**권위 맵:** `00_Document_Authority_Read_Path.md`

---

## 레포 삽입 메타 (한국어)

| 역할 | 설명 |
|------|------|
| **동반 정본** | **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** 와 **같은 M2–M4 순서 잠금**을 공유한다. 본 문서는 **Anthropic·하네스 교훈 → 우리 어휘 번역**, **M2 필드·성공 조건** 상세, **M5a/b 분리**, **M6+ 도메인** 보강이다. |
| **충돌 규칙** | 순서·마일스톤 번호가 어긋나면 **Alignment Memo + `COS_Project_Directive_NorthStar_FastTrack_v1.md` §4** 가 이긴다. |
| **아키텍처 리셋 파일명** | 아래 §2 표의 아키텍처 리셋은 **`COS_Slack_Architecture_Reset_2026-03.md`** (외부 초안명 `Slack_COS_Architecture_Reset_Handoff_2026-03-22`). |

**제품 한 줄·권위 6단·좌절 A–E·M2 복합 정의**는 Alignment Memo §0–§11 과 동일하므로 여기서는 **반복하지 않는다**. 필요 시 그 문서를 연다.

---

## 0. Read Pathway first

This document is a **build-path lock** focused on:

- **how** to use Anthropic-style harness patterns **inside** our COS-first Slack product, and  
- **exact** M2 field / success / reporting expectations **without** duplicating the Alignment Memo constitution text.

The repo already has meaningful COS Core assets. The risk is building the **wrong next thing** or mis-importing “agent harness” as **surface UX**.

---

## 1. Product truth (pointer)

We are building a **Slack-native COS operating system** — one executive-facing mind, hidden internal APIs, multi-agent orchestration, decision-heavy UX, drill-down transparency, semi-autonomous execution after closure.

**Pinned sentence (extended vs Alignment Memo §18):**

> A **transparent, decision-centric, Slack-native COS operating system** whose internal machinery disappears behind **one executive-facing mind**, while **long-running agent harness patterns** power the **hidden execution layer**.

(Alignment Memo: same core, without the explicit “harness powers hidden layer” clause — both are true.)

---

## 2. Authority order (harness doc — not constitution)

When documents disagree:

1. `COS_Project_Directive_NorthStar_FastTrack_v1.md`
2. `COS_Slack_Architecture_Reset_2026-03.md` *(was named `Slack_COS_Architecture_Reset_Handoff_2026-03-22` in external drafts)*
3. `COS_Inbound_Routing_Current_260323.md`
4. `COS_NorthStar_Workflow_2026-03.md`
5. `COS_OpenClaw_Vision_Roadmap_2026-03.md`
6. `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md`

**This Pathway** sits **beside** item 5–6 as **implementation interpretation**: harness translation, artifact habits, M5 split, M6 framing. It does **not** override 1–3.

If a lower doc pulls toward command sprawl, slash-first, hosted-first, scheduler-first, persona-polish-first, shiny non-load-bearing features — **Directive wins**.

---

## 3. Layer truth (pointer)

Layer A assets exist; the next step is **not** a greenfield architecture. Formalize: **transparency spine → decision/control objects → minimal autonomous continuation → then transport UX**. (Alignment Memo §3, OpenClaw roadmap.)

---

## 4. Anthropic harness lessons — copy vs not copy

### 4.1 What public harness-style work is useful for

- Long-running coding harness discipline  
- Agent **handoff artifacts**  
- **Planner / generator / evaluator** separation  
- Structured **“done contract”**  
- Tool-based evaluation (browser / QA)  
- **Incremental persistence**  
- Agent runtime discipline  

Relevant because we need: semi-autonomous chunks, recovery, auditability, **proof-linked** completion, role split with **intentional tension**.

### 4.2 What it is NOT

- Not the full Slack executive COS product  
- Not a decision-centric CEO interface by itself  
- Not our surface UX  
- Not a reason to make **slash** the center  

### 4.3 Correct use

**Use for:** engine discipline, artifact discipline, role separation, evaluation discipline, loop structure.  
**Do not use to:** replace COS-first UX, expose more agent guts to the CEO, over-build orchestration early, or copy demos as architecture.

---

## 5. Anthropic → our product vocabulary (translation map)

| Anthropic / harness idea | Our concept |
|---------------------------|-------------|
| initializer agent | COS prep / initialization artifact builder |
| coding agent | Builder / execution worker |
| evaluator agent | QA / critic / verifier worker |
| planner agent | COS planning / orchestration layer |
| feature list JSON | Work queue / scoped execution units / acceptance spec |
| claude-progress.txt–like file | COS progress artifact linked to **trace** |
| sprint contract | **Decision packet** + approval basis + execution unit |
| tool-based browser QA | Evaluator worker (e.g. Playwright) — **after** M2 |

Do **not** rename our modules slavishly to Anthropic terms; **absorb the pattern**, keep product vocabulary.

---

## 6. Adopt immediately (artifact & role habits)

### 6.1 Artifact discipline

Long runs need durable artifacts (recovery, continuity). Examples to converge toward:

- `project_brief.md` (or equivalent)  
- `cos_progress.md` (or trace-linked summary)  
- `decision_packets.json` (or store)  
- `work_queue.json` (seed)  
- `proof_refs.json`  
- Trace records keyed by **`turn_id`**

### 6.2 Planner / builder / evaluator split

- COS / planner / orchestrator  
- Builder worker  
- QA / evaluator / critic  
- Risk / policy critic (as needed)  

Matches **cooperative tension**: no single agent implements + self-certifies unchecked; COS is not unchecked dictator.

### 6.3 Explicit done contract

Before a meaningful chunk: **what**, **how checked**, **what counts as proof**, **what needs approval**. In our system → **decision packet**, **approval matrix**, **proof refs**, **status packet**.

### 6.4 Tool-based evaluator

Real flow exercise for UI-heavy products (e.g. Abstract) — **after** packet/control foundations.

### 6.5 Worker-layer runtime

Agent-SDK-like patterns belong in **worker/runtime (M3+)**, not rebuilding the **Slack front door** around SDK.

---

## 7. Do NOT adopt

1. Demo scaffolds as authoritative architecture  
2. Slash/buttons as product center  
3. Giant DAG / distributed workflow empires **before** approved-unit queue seed  
4. “Agentic” without **trace + packet lineage + proof** (opaque autonomy)  

---

## 8. Remaining core gaps (honest)

- Core **identity alignment**: strong  
- **Executive interaction maturity**: early  
- **Transparent autonomy maturity**: early  
- **Harness-class operational maturity**: incomplete  

Blockers: **(1) trace spine (2) decision packet (3) approval matrix (4) work queue seed** — same as Alignment Memo.

---

## 9. M2 = composite milestone (locked)

**M2a** — minimal trace spine (boring, append-only, **not** a telemetry platform).  
**M2b** — decision/control foundation (packet, parser, matrix stub, **packet_id in trace**).  

**One milestone:** trace-only without packet = infra drift; packet-only without trace = fake transparency.

---

## 10. M2a — exact runtime contract

Each inbound turn, a traceable record with:

| Field | Notes |
|-------|--------|
| `turn_id` | stable |
| `thread_key` | correlation |
| `channel_id` | |
| `user_id` | |
| `timestamp` | |
| `input_text_normalized` | |
| `final_responder` | |
| `surface_intent` | nullable |
| `command_name` | nullable |
| `response_type` | nullable — `finalizeSlackResponse` 계약 값(조회 `not_found`·surface `ask_status`·구조화 `structured_command` 등) |
| `packet_id` | nullable |
| `status_packet_id` | nullable — M2b 상태 패킷 `STP-*` (`ask_status` 등) |
| `work_queue_id` | nullable — M3 시드(결정 `pick` 후 `AWQ-*`) |
| `plan_id` | nullable |
| `work_id` | nullable |
| `run_id` | nullable |
| `approval_id` | nullable |
| `status` | e.g. ok / error |
| `duration_ms` | |
| `error` | nullable |

**Storage:** local append-only **JSONL** first. No dashboards / pipelines / analytics UI in M2a.

---

## 11. M2b — exact meaning

### 11.1 Decision packet (minimum fields)

`packet_id`, `topic`, `context_summary`, `options[]` (`option_id`, `title`, `short_description`, `tradeoffs`, `estimated_cost`, `estimated_time`, `reversibility`, `risk_level`), `recommended_option_id`, `recommendation_reason`, `approval_required`, `consequence_of_delay`, `suggested_reply_examples`, `linked_plan_ids`, `linked_work_ids`, `linked_run_ids`, `generated_at`.

### 11.2 Short reply parser

Map: `1안`, `2안`, `2안으로 가자`, `더 빠른 쪽`, `비용 적은 쪽`, `보류` → stable packet resolution.

### 11.3 Approval matrix

Dimensions: `action_type`, `environment`, `external_visibility`, `cost_band`, `data_sensitivity`, `reversibility`, `user_impact`, `brand_impact`, `infra_risk`, `secret_scope`, `default_policy`, `escalation_reason`.

Outputs only: `auto_allowed` | `cos_approval_only` | `executive_approval_required`.

**코드 v1 (2026-03):** `evaluateApprovalPolicy` — `decision_defer`→`auto_allowed`; `decision_pick`에서 `environment_key===prod`·프로필 risk·옵션 `risk_level`·되돌리기·비용 밴드 휴리스틱 → `executive_approval_required`, 그 외 `cos_approval_only`. 결정 짧은 답은 채널 `getEnvironmentContext`·`metadata.env_key`·기본 `dev`로 환경 해석.

### 11.4 Status packet (default sections)

진행 변화 / 현재 막힘 / 대표 결정 필요 / COS 다음 자동 액션 / 근거·증거 — no default internal dump.

---

## 12. M2 success checkpoint

After M2, the system should:

1. Receive CEO goal or blocked-choice situation  
2. Produce decision packet with stable `packet_id`  
3. Write packet lineage into trace  
4. Accept short CEO reply  
5. Map reply to packet  
6. Evaluate approval policy for next action  
7. Preserve inspectable lineage for drill-down  

---

## 13. M3 — clarified

**Seed only** — not an orchestration empire.

**Means:** enqueue approved/authorized unit, assign worker/tool, lifecycle, blocker/escalation, proof refs, summarize back to Slack — **reuse** planner, work/run, adapters, approvals, Cursor/GitHub.

**Does not mean:** big DAG, distributed platform, “civilization simulator.”

**Question answered:** *What is the minimum queueable unit so COS continues after a decision/approval without CEO micromanaging the next step?*

**얇은 코드 시드 (현행):** 스레드 결정 tail에서 `pick`이면 `agentWorkQueue.js`가 `decision_follow_up`를 append(`AWQ-*`, 패킷의 `linked_plan_ids`/`linked_work_ids`/`linked_run_ids` 반영, `linked_work_id`·`linked_run_id`는 첫 항목), Slack·trace에 `work_queue_id`. **`patchAgentWorkQueueItem`** 로 상태·블로커·WRK/RUN·`proof_refs` append. 회귀 `classifyInboundResponderPreview`·`replay-slack-fixtures`는 `결정비교` 턴에 `packet_id`·`decision_packet`을 finalize에 전달.

---

## 14. M4 — transport shell (narrow)

**Scope:** `/g1cos` **packet** query/action, packet buttons, approval buttons, status refresh / drill-down — all consuming **`packet_id` / `turn_id` / `work_queue_id` / `approval_id` / `work_id`** (lineage IDs).

**Rule:** M4 **must not bypass** packet model, approval policy, trace.

**Framing:** **Thin transport on the correct model** — not “meaningful slash expansion” as a goal in itself.

**코드 시드 (현행):** 멘션/DM·`/g1cos` 공통으로 `g1cosLineageTransport.js` — `턴`/`trace`·`패킷`·`워크큐`·**목록/대기**·실행 브리지·**증거·CI 훅 안내**(드릴다운/`proof_refs` 요약). `runInboundStructuredCommands` 의 **`워크큐*`**·**`워크큐증거`/`러너증거`**·**dispatch 성공 시 `linkAgentWorkQueueRunForWork`**(커서·GitHub 이슈·Supabase 발행)·선택 **`ciWebhookServer` CI 훅**. 버튼·승인 액션은 후속.

---

## 15. M5 — split framing

### M5a — Runtime hardening

Multi-instance-safe dedup, shared locks, worker safety, shared runtime storage.

### M5b — Persistence & platform consistency

Packet/trace persistence & queryability, slash/mention/DM consistency, replayable history, continuity across restart/redeploy.

### Tool registry v2

Can start **thin after M2** when tool calls need a real gate — **must not** displace M2 or M3.

---

## 16. M6+ — domain products

Abstract, scheduling, grants, IR/BM, budget/ops/strategy are **modules on the substrate**, not “just features.”

**Before M2/M3:** do not start as full product builds.  
**After M3 seed:** narrow domain slices become viable.

---

## 17. No-go lines (extended)

1. Do not expand `/g1cos` into broader command surface  
2. Do not treat slash/buttons as **main** milestone  
3. No scheduler/brief auto-push as primary patch  
4. No hosted/apply as primary  
5. No Supabase-first migration as **the** story  
6. No persona prompt tuning as primary  
7. No Council polish before packet/control real  
8. No many aliases as fake progress  
9. No “packet” without stable `packet_id`  
10. No “trace” that is only console logs  
11. No giant DAG/worker platform before approved-unit queue seed  
12. No importing Anthropic patterns in a way that **replaces** COS-first executive UX  

---

## 18. Executive UX contract & proof (pointer)

Desired utterances, COS response shapes, and proof-aware “done” → same intent as Alignment Memo §14–§15 / Pathway source memo; **minimum proof refs**: file path, handoff path, run_id, work_id, packet_id, approval_id, PR URL, test result, **trace record reference**, artifact summary.

---

## 19. Next patch target

**M2a minimal trace spine** first; if still thin, **first slice of M2b** (schema + renderer + one parser path + `packet_id` in trace).

**Not next:** slash expansion, hosted/scheduler/storage as center, Anthropic worker stack **before** packet/control/trace anchor.

---

## 20. Expected deliverables

### M2a only

Trace helper, append-only write, `turn_id`, thread correlation, final responder, nullable linkage fields, **tests that prove records written**.

### M2a + thin M2b

Also: `decisionPacket` schema, minimal renderer, one deterministic parser path, packet IDs in trace.

**Principle:** thin, boring, correct **>** ambitious and leaky.

---

## 21. Reporting format after next patch

1. North Star gap closed  
2. Frustrations reduced (A–E)  
3. **M2a / M2b / both**  
4. New runtime contracts  
5. Files changed  
6. Schemas introduced  
7. Intentionally left out  
8. Tests  
9. Manual Slack smoke  
10. Risks  
11. Next patch  
12. Owner commands  
13. Handoff/docs updated  

If both M2a and M2b: **how packet links to trace**; what remains before M3.

---

## 22. Final interpretation sentence

We are **not** building a smarter command bot.

We are building:

**A transparent, decision-centric, Slack-native COS operating system whose internal machinery disappears behind one executive-facing mind, while long-running agent harness patterns power the hidden execution layer.**

---

## 23. Appendix — 비판적으로 수용할 점 (한국어)

1. **문서 중복 리스크** — Pathway가 Alignment와 **또 하나의 헌법**처럼 읽히면 위험한다. 레포에서는 **Pathway = 보강·번역·상세 계약**으로 격을 낮춰 두었고, 충돌 시 **디렉티브 + Alignment**가 이긴다.  
2. **M4 표현** — Pathway는 `/g1cos packet query/action` 을 말한다. 이것이 **“슬래시 확장 허용”** 으로 오해되면 안 된다. **패킷·trace·정책 모델 위의 얇은 껍데기**일 때만 허용(M4).  
3. **아티팩트 파일 나열** (`cos_progress.md` 등) — 아직 레포 규약이 없어 **이름·경로는 M2 구현 때 `paths.js` 또는 trace 모듈과 단일화**해야 한다. 지금은 **습관·방향**으로만 둔다.  
4. **Tool registry v2 “M2 이후 얇게”** — 좋은 완화이지만, **실제 게이트 코드**가 들어가면 M2b 승인 매트릭스와 **동시 설계**가 필요할 수 있다. 과잉 분리 주의.  
5. **Anthropic Agent Teams vs 우리** — 공개 제품은 “코딩 IDE 팀” 축이 강하다. 우리는 **슬랙·대표 1창구·결정 패킷**이 중심 — 번역 맵(§5)이 그 차이를 고정한다.

---

### Owner actions

```bash
cd /path/to/g1-cos-slack && npm test
```

다음 구현: **M2a** (Pathway §10, Alignment Memo §11).
