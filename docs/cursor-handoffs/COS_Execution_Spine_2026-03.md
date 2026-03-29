# COS Execution Spine — 실행 척추

> 코드 기준일: 2026-03-29  
> 관련 패치: `feat: execution spine — post-lock COS ownership + packet/run materialization`

## 1. 핵심 변경

`start_project` 흐름이 **intake-only**가 아니라 **execution까지 이어지는 owner-state machine**이 되었다.

### 이전 (문제)
```
explore → refine → lock-confirmed → session 삭제 → council이 다시 final speaker
```

### 이후 (수정)
```
explore → refine → execution_ready → execution_running → execution_reporting → completed
```

Session은 lock-confirmed 직후 삭제되지 않고, `execution_running`으로 전이된다.

## 2. Session Lifecycle (`projectIntakeSession.js`)

| Stage | Owner | Council 허용 |
|-------|-------|-------------|
| `active` | pre-lock intake | defer surface |
| `execution_ready` | COS execution | 차단 |
| `approval_pending` | COS execution | 차단 |
| `execution_running` | COS execution | 차단 |
| `execution_reporting` | COS execution | 차단 |
| `completed` | 종료 (세션 삭제) | 재허용 |
| `cancelled` | 종료 (세션 삭제) | 재허용 |

### 핵심 함수
- `isActiveProjectIntake(metadata)` → OWNER_STAGES 전체 (pre-lock + execution)
- `isPreLockIntake(metadata)` → `active` 만 (spec mutation 전용)
- `hasOpenExecutionOwnership(metadata)` → execution 단계만
- `transitionProjectIntakeStage(metadata, newStage, extra)` → 상태 전이

## 3. Execution Object (`executionRun.js`)

### Execution Packet (`EPK-...`)
생성 시점: lock-confirmed (scope 충분성 충족 + 진행 시그널)

### Execution Run (`RUN-...`)
생성 시점: packet 직후 자동 생성

필드:
- `run_id`, `packet_id`, `session_id`
- `project_goal`, `locked_mvp_summary`
- `includes`, `excludes`, `deferred_items`
- `current_stage`, `status`
- `workstreams` — 4-lane (research, swe, uiux, qa)
- `git_trace` — repo, branch, issue_id, pr_id, commit_shas[]
- `cursor_trace`, `supabase_trace`
- `escalation_policy`

## 4. Execution Spine Router (`executionSpineRouter.js`)

Post-lock 스레드에서 대표 메시지가 들어오면:
1. `hasOpenExecutionOwnership` 체크
2. 매칭: progress → reporting / escalation → escalation / completion → completed
3. 기본: execution_running status surface

**Council/matrix는 절대 final speaker가 되지 못함.**

## 5. 4-Lane Workstream Model

| Lane | 역할 | 산출물 |
|------|------|--------|
| `research_benchmark` | 기존 패턴·UX baseline | research note |
| `fullstack_swe` | app skeleton·data model | GitHub issue + branch + Cursor handoff |
| `uiux_design` | view model·permission surface | UI spec delta + wireframe |
| `qa_qc` | acceptance criteria | test checklist + smoke cases |

## 6. Router Precedence

```
1. version 명령
2. 도움말
3. intake cancel
4. ★ EXECUTION SPINE (hasOpenExecutionOwnership) ← 신규
5. spec build thread (isPreLockIntake)
6. decision short reply
7. lock/refine/kickoff
8. lineage / query / planner / structured / surface
9. AI router (execution spine guard 포함)
```

## 7. 테스트

### 신규 (`test-execution-spine.mjs`)
1. lock-confirmed 후 session이 `execution_running`으로 남음
2. packet_id/run_id가 open run에 resolve됨
3. council report가 execution 중 표면에 안 나옴
4. execution_running에서 run_id + lane 요약만 나옴
5. escalation 없이는 council/matrix가 final renderer 안 됨

## 8. Council/Matrix 재허용 조건

- session이 `completed` 또는 `cancelled`일 때만
- `인테이크 취소` 명시적 명령
- `실행 완료` / `프로젝트 완료` 명시적 명령
