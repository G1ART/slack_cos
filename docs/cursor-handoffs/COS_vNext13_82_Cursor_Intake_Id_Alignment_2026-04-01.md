# COS vNext.13.82 — Cursor 콜백 입고 ID 정합 (2026-04-01)

## 문제

운영에서 `cursor_callback_correlated_but_closure_not_applied` / `cos_packet_progression_skipped_reason` 가 **`accepted_external_id_correlation_not_found`** 와 **`ledger_packet_id_mismatch_correlation`** 을 번갈아 찍는 경우가 있었다. 원인: 트리거 응답의 **짧은/별칭 accepted id** 와 바인딩 시 저장한 **`tool_*` automation_request_id** 가 달라 상관 행이 둘로 갈리거나, 웹훅이 **다른 키**로만 `request_id` 를 보내는 경우.

## 조치

1. **`commitReceivedCursorCallbackToRunPacket`** (`src/founder/cursorReceiveCommit.js`): 입고 시 accepted id **후보 순회** — 웹훅 `accepted_external_id`, `callback_request_id_hint`, 그리고 `run_uuid_hint` 가 있으면 런의 **`cursor_dispatch_ledger.automation_request_id`** (pending 콜백일 때). 상관 행은 찾았으나 **ledger `target_packet_id` 와 불일치**하면 다음 후보로 재시도.
2. **`recordCursorCloudCorrelation`** (`src/founder/providerEventCorrelator.js`): **`automationRequestId`(= 트리거 `request_id`)** 로 `accepted_external_id` 상관을 **항상 재확정**하고, API가 다른 문자열을 주면 **별칭 행**으로 추가 upsert.
3. **`findExternalCorrelationCursorHintsWithMeta`** (`src/founder/correlationStore.js`): **`run_id` 만 있을 때** 런 ledger의 `target_packet_id` 로 패킷을 좁히고, Supabase에서는 패킷 없을 때 **`accepted_external_id`** 행만 최신순으로 고른다 (임의 첫 행 방지).
4. **`computeCursorWebhookFieldSelection`**: `request_id` 힌트를 **data/context/nested/job** 등으로 확장.

## 검증

- `node scripts/test-v13-82-cursor-intake-candidate-fallback.mjs`
- `node scripts/test-v13-77-receive-intake-commit.mjs`

## Owner actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
node scripts/test-v13-82-cursor-intake-candidate-fallback.mjs
node scripts/test-v13-77-receive-intake-commit.mjs
npm test
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "fix(cursor): intake commit ID candidates + correlation ledger narrowing (v13.82)"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
