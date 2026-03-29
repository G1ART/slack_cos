# COS Convergence Patch — Router + State + Playbook + Research + Execution Spine 통합

**날짜**: 2026-03-29
**목적**: 대표-facing COS를 open-world operating system으로 수렴

---

## 무엇이 바뀌었는가

### 1. Responder Taxonomy 정비
- `'dialog'` → `'partner_surface'` 완전 대체 (response_type 포함)
- JSDoc `@returns` typedef에서 `'dialog'` 제거, `'research_surface'` / `'partner_surface'` / `'execution_spine'` 추가
- `topLevelRouter.js`의 council_blocked 목록에 `execution_running_surface`, `execution_reporting_surface`, `escalation_surface` 추가

### 2. Dynamic Playbook → Execution Bridge
- `checkPlaybookExecutionPromotion(text, threadKey)` — "진행해줘" 등 proceed intent 감지
- `linkPlaybookToExecution(playbookId, { packet_id, run_id })` — 양방향 연결
- `runInboundAiRouter.js`에 playbook → execution promotion 경로 추가
  - active playbook + proceed signal → createExecutionPacket → createExecutionRun → renderExecutionRunningPacket
  - council 완전 우회

### 3. Execution Run Artifact Metadata
- `createExecutionRun()`에 `artifacts` 구조 추가 (4-lane별 machine-readable attachment)
- `originating_playbook_id`, `originating_task_kind` 필드 추가
- `attachRunArtifact(runId, laneType, data)` — lane별 artifact 첨부
- `updateRunGitTrace(runId, traceUpdate)` — progressive git trace 갱신 (commit_shas 누적)

### 4. Live Search Provider Seam
- `src/features/liveSearchProvider.js` — 검색 provider 추상화 계층
  - `buildSearchQuery()` / `executeLiveSearch()` / `normalizeResults()` / `formatCitations()`
  - `COS_SEARCH_PROVIDER` env로 활성화 (현재 stub → 다음 패치에서 Tavily/Perplexity 연결)
- `representativeResearchSurface.js`에 live search 통합 seam 연결
  - `freshness_required=true`일 때 자동 시도, 미설정 시 명시적 안내

### 5. Observability 강화
- `dynamic_task_interpreted` 이벤트에 `run_id`, `packet_id`, `execution_ownership` 추가
- playbook→execution promotion 시 `router_responder_selected/locked`에 `playbook_id`, `run_id`, `packet_id` 포함

---

## Session Lifecycle 진실

| stage | isActiveProjectIntake | isPreLockIntake | hasOpenExecutionOwnership | touch 가능 | 삭제 |
|---|---|---|---|---|---|
| active | ✅ | ✅ | ❌ | ✅ | ❌ |
| execution_ready | ✅ | ❌ | ✅ | ✅ | ❌ |
| approval_pending | ✅ | ❌ | ✅ | ✅ | ❌ |
| execution_running | ✅ | ❌ | ✅ | ✅ | ❌ |
| execution_reporting | ✅ | ❌ | ✅ | ✅ | ❌ |
| completed | ❌ | ❌ | ❌ | ❌ | ✅ (자동) |
| cancelled | ❌ | ❌ | ❌ | ❌ | ✅ (자동) |

---

## Canonical Responder Taxonomy

| responder | 언제 | council user-facing? |
|---|---|---|
| `partner_surface` | 일반 자연어 대화 기본값 | ❌ |
| `research_surface` | research hypothesis → research | ❌ |
| `executive_surface` | start_project intake/refine | ❌ |
| `execution_spine` | post-lock execution | ❌ |
| `council` | explicit council command만 | ✅ (명시적) |
| `escalation_surface` | bounded escalation | 제한적 |
| `planner` | 계획등록 등 structured | ❌ |
| `query` | 조회 등 structured | ❌ |

---

## Playbook ↔ Run Linkage Truth

```
DynamicPlaybook
  ├─ playbook_id
  ├─ linked_packet_id → EPK-...
  ├─ linked_run_id → RUN-...
  └─ kind / mode / status

ExecutionRun
  ├─ run_id
  ├─ packet_id
  ├─ originating_playbook_id → PBK-...
  ├─ originating_task_kind
  ├─ artifacts (machine-readable per lane)
  └─ git_trace (progressive)
```

---

## 다음 패치 우선순위

1. **Live search provider 연결** — `COS_SEARCH_PROVIDER=tavily` 또는 Perplexity
2. **Execution orchestration outbound** — GitHub issue seed / Cursor handoff 자동 생성
3. **Supabase schema draft** — execution_run에서 자동 마이그레이션 초안
4. **Playbook promotion UX** — promoted playbook을 대표에게 surface

---

## Owner actions

### 로컬 검증
```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)
```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "convergence: unify router/state/playbook/research/execution spine"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
