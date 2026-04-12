# 성능 계약 — 궁극 목표·로드맵 (2026-04-12)

정본 순서: `00_Document_Authority_Read_Path.md`. 배경 비전: `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md`, 콜백 감사: `COS_Ops_Smoke_Callback_Pipeline_Audit_2026-04-01.md`.

## 1. 궁극 목표 (Ultimate goal)

**“내가 기대하는 퍼포먼스를 정확히 낸다”** 는 아래를 **동시에** 만족할 때 성립한다.

1. **완료 권위(Authority)**  
   - Narrow delegate `emit_patch` (`live_patch.live_only` + `live_patch.no_fallback`) 구간에서 **성공 판정의 정본은 프로바이더(Cursor) 콜백·receive 인테이크 계약**이며, GitHub push/reflection 매칭은 **부차(advisory) 증거**로만 요약·진단에 쓴다. (코드 앵커: `cursorResultRecovery.js`, `test-v13-57-recovery-callback-vs-github.mjs`.)
2. **관측 정합(Observability)**  
   - 동일 `run_id`·세션에 대해 **DB 플랫 행 → 세션 집계 → 요약 스크립트**가 같은 이벤트 집합을 본다. Post-callback `ops_smoke_phase` 등은 `attempt_seq` 없이도 세션 탑라인에 포함된다. (v13.83, `opsSmokeParcelGate.js`.)
3. **회귀 증명(Proof)**  
   - 로컬에서 **`npm test`** 와 **`npm run verify:parcel-post-office`** 가 통과하고, 성능 계약 묶음 **`npm run verify:performance-contract`** 가 통과한다.
4. **운영 가시성(Ops)**  
   - Supabase 자격이 있으면 **`npm run audit:parcel-health`** 로 하드 `warnings` 가 비어 있는지 확인할 수 있다. (환경·토큰 의존 구간은 별도.)

**이 목표가 말하지 않는 것**: Slack 문구 UX·프롬프트 준수·Cursor 가용성까지 코드만으로 “항상” 보증하지 않는다. 다만 **거짓 녹색(stale block, 집계 누락, 2차 증거를 완료로 오인)** 은 위 불변식으로 최소화한다.

## 2. 로드맵 (단계·출구 기준)

| 단계 | 내용 | 출구 기준 |
|------|------|-----------|
| **A–C** | 택배사무소(게이트·뷰·wake·샤딩) | `verify:parcel-post-office` + 관련 불변식 테스트 |
| **D1** | Intake·ledger·correlation (v13.77–82) | `test-v13-77-receive-intake-commit.mjs` 등 통과 |
| **D2** | 세션 집계 post-callback phase (v13.83) | `test-v13-83-post-callback-ops-phases-in-aggregate.mjs` |
| **E** | Strict lane: GitHub envelope 옵트아웃 (v13.84) | 프로덕션에서 `COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY=1` 설정 시 narrow live 수락 후 GitHub secondary envelope 미등록; 로그 `cos_github_recovery_envelope_skipped` |
| **F** | 파운더 멘트·슬랙 표면 | North Star·스레드 계약 문서와 코드 정합(별 턴; Socket 실연은 현장 스모크) |
| **G** | 대청소 | `COS_Cleanup_Phase_G_Backlog_2026-04-12.md` 순서·전제 충족 시에만 레거시 제거 |

## 3. 환경 변수 (E단계)

- `COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY=1` — narrow delegate live_patch에 한해 `registerRecoveryEnvelopeFromEmitPatchAccept` 호출 생략. 기본(미설정)은 기존과 동일하게 envelope 등록.

## 4. Owner actions

- 로컬: `npm run verify:performance-contract`, `npm test`, (가능 시) `npm run audit:parcel-health`
- Git: 워크스페이스 규칙에 따라 `pull --rebase` → `commit` → `push`

## 5. 배포 후 현장 검증 메모 — `smoke_2026_04_12_live_34` (2026-04-12)

**요약 스크립트(Supabase):** `final_status=authoritative_callback_closure_applied`, `breaks_at` 없음, `delegate_live_patch_present=true`, `accepted_external_id` 정상.

**live_33 대비:** `phases_seen`에 **`github_secondary_recovery_matched` 없음** — narrow live + `COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY=1` 배포 시 **recovery envelope 푸시 매칭 행이 생기지 않는 것**과 정합. `github_fallback_evidence`는 GitHub 웹훅 감사 경로로 **남을 수 있음**(부차 증거; 완료 권위 아님).

**Supabase 타임라인 CSV:** `cursor_receive_intake_committed` 2회, `external_callback_matched` / `authoritative_callback_closure_applied` 2회(오케스트레이터+프로바이더 파동), `cos_cursor_webhook_ingress_safe` 상관 키 `accepted_external_id`. `founder_milestone_sent`에 `milestone:blocked` 한 번은 live_only 스레드에서 선행 `create_spec` 시도가 프로필에 막힌 뒤 `emit_patch`로 이어진 흐름과 부합.

**슈퍼바이저 행:** `pending_supervisor_wake=false`, `last_supervisor_wake_request_at` 이 콜백 직전대와 맞으면 **wake 소비 정상**. `status=blocked`는 런 그래프상 패킷/런 상태가 아직 `completed`로 올라가지 않은 경우에 흔함 — 스모크 **콜백 성공**과 동치는 아님(필요 시 `cos_runs`·패킷 상태 별도 확인).

**Railway:** 로그에서 `cos_github_recovery_envelope_skipped`(strict) 및 `cos_cursor_callback_evidence` 시각을 Supabase `created_at`과 맞추면 인입 지연·이중 콜백을 설명하기 쉬움.

**감사 스크립트:** `--strict`는 `advisory`만 있어도 exit 1 — JSON에 `strict_exit_nonzero`, `strict_fail_due_to_advisory` 등으로 원인 표기(패치 v13.85).
