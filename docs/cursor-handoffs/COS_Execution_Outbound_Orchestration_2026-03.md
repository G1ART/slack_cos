# COS Execution Outbound Orchestration

**날짜**: 2026-03-29
**목적**: execution_run을 GitHub / Cursor / Supabase outbound의 실제 드라이버로 전환

---

## 아키텍처

```
execution_run (state/object)
     │
     └── executionOutboundOrchestrator.js (canonical bridge)
              │
              ├── GitHub   → ensureGithubIssueForRun()
              │               ├─ live: 실제 issue 생성 (auth 있을 때)
              │               └─ draft: 구조화 payload 저장 (auth 없을 때)
              │
              ├── Cursor   → ensureCursorHandoffForRun()
              │               └─ 자동 handoff markdown 생성 + 디스크 기록
              │
              ├── Supabase → ensureSupabaseDraftForRun()
              │               ├─ DB 작업 implied → schema draft JSON 생성
              │               └─ DB 작업 아님 → skip
              │
              ├── Research  → seedResearchArtifact()
              ├── UIUX     → seedUiuxArtifacts()
              └── QA       → seedQaArtifacts()
```

## Outbound State Model (lane별)

각 workstream lane에 `outbound` 메타데이터 추가:

| 필드 | 설명 |
|---|---|
| `outbound_provider` | `github` / `cursor` / `supabase` / `internal` / null |
| `outbound_status` | `pending` / `drafted` / `dispatched` / `completed` / `manual_required` / `blocked` / `failed` |
| `outbound_ref_ids` | 외부 참조 ID/URL 배열 |
| `last_outbound_at` | 마지막 outbound 시각 |
| `last_error` | 마지막 에러 메시지 (null if ok) |

## Provider별 동작

### GitHub (`fullstack_swe` lane)

| 상태 | 조건 | 결과 |
|---|---|---|
| `GITHUB_FINE_GRAINED_PAT` 또는 `GITHUB_APP_*` 설정됨 | `isGithubAuthConfigured()=true` | **live** issue 생성 → `dispatched` |
| 인증 미설정 | `isGithubAuthConfigured()=false` | **draft** payload 저장 → `drafted` |
| repo target 미설정 | `resolveGitHubRepoTarget()=null` | `manual_required` |
| API 에러 | 네트워크/권한 실패 | `failed` (run 유지, lane만 표시) |

### Cursor (`fullstack_swe` lane)

- 자동으로 `docs/cursor-handoffs/COS_Exec_Handoff_<slug>_<run_id>.md` 생성
- Locked scope, workstream objective, dependencies, done criteria 포함
- `cursor_trace[]`에 기록
- `git_trace.generated_cursor_handoff_path` 갱신

### Supabase (`fullstack_swe` lane)

- DB 작업 감지 패턴: `supabase`, `schema`, `migration`, `table`, `column`, `RLS`, `policy`, `데이터`, `DB` 등
- 감지 시: `data/supabase-drafts/supabase_draft_<slug>.json` 생성
- `supabase_trace[]`에 기록
- 감지 안 되면: `skipped` (정직하게 건너뜀)

## Trace 구조

### git_trace (progressive)
```json
{
  "repo": "owner/repo",
  "branch": "feat/calendar-tool",
  "issue_id": "42",
  "pr_id": null,
  "commit_shas": ["sha1", "sha2"],
  "handoff_doc_path": null,
  "generated_cursor_handoff_path": "docs/cursor-handoffs/COS_Exec_Handoff_...",
  "supabase_migration_ids": []
}
```

### cursor_trace[]
```json
[{
  "created_at": "2026-03-29T...",
  "dispatch_mode": "auto_generated",
  "handoff_path": "docs/cursor-handoffs/COS_Exec_Handoff_...",
  "status": "created"
}]
```

### supabase_trace[]
```json
[{
  "created_at": "2026-03-29T...",
  "kind": "schema_draft",
  "draft_path": "data/supabase-drafts/supabase_draft_...",
  "status": "drafted"
}]
```

## Observability 이벤트

| 이벤트 | 필드 |
|---|---|
| `outbound_dispatch_started` | run_id, packet_id, playbook_id, lane_type, provider, mode |
| `outbound_dispatch_succeeded` | run_id, lane_type, provider, mode, artifact refs |
| `outbound_dispatch_failed` | run_id, lane_type, provider, error |
| `artifact_attached` | run_id, lane_type, artifact name |
| `git_trace_updated` | run_id, trace fields |
| `cursor_trace_updated` | run_id, handoff_path |
| `supabase_trace_updated` | run_id, draft_path |

## ENV 요구사항

| Variable | 용도 | 필수 여부 |
|---|---|---|
| `GITHUB_FINE_GRAINED_PAT` | GitHub issue 라이브 생성 | 선택 (없으면 draft) |
| `GITHUB_DEFAULT_OWNER` | 기본 repo owner | GITHUB 라이브 시 필요 |
| `GITHUB_DEFAULT_REPO` | 기본 repo | GITHUB 라이브 시 필요 |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` | GitHub App 인증 | PAT 대안 |

## 다음 패치 우선순위

1. **자동 dispatch 연결** — run 생성 시 `dispatchOutboundActionsForRun()` 자동 호출
2. **GitHub live 테스트** — GITHUB_FINE_GRAINED_PAT 설정 후 실제 issue 생성 검증
3. **Cursor 리턴 경로** — Cursor 실행 결과를 `cursor_trace`에 자동 회수
4. **Supabase live 연결** — 실제 마이그레이션 생성/적용 경로
5. **대표 명령어** — "outbound 현황" → `formatOutboundStatusForSlack()` 표면

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
git commit -m "execution outbound orchestration: github/cursor/supabase bridge"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
