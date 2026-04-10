# vNext.13.62 — Cursor callback gate (functional refactor)

## 요약

- **게이트 모듈**: `src/founder/cursorCallbackGate.js` — emit_patch 경로 지문(`computeEmitPatchPayloadPathFingerprint`), 배열 경로 지문, 불충분 페이로드용 `buildCursorCallbackInsufficientDiagnostics`.
- **웹훅 정규화**: `computeCursorWebhookFieldSelection` / `normalizeCursorWebhookPayload`가 `backgroundComposerId` 등 **accepted_external_id** 후보, `request_id`, `paths_touched` 기반 지문을 수집. 최소 통과 조건에 **accepted_external_id만** 추가(기존: run id / thread / run_uuid+packet).
- **상관**: `findExternalCorrelationCursorHintsWithMeta` 순서 — `cloud_agent_run` → **`accepted_external_id`** → **`automation_request_path_fp`** (`request_id|fingerprint`) → run_uuid+packet → thread+packet.
- **트리거 수락**: `recordCursorCloudCorrelation`이 위 상관 키를 upsert하고, 런 행에 **`cursor_callback_anchor`** JSON을 패치. Supabase: `supabase/migrations/20260410120000_cos_runs_cursor_callback_anchor.sql`.
- **도구 경로**: `toolsBridge`가 `accepted_external_id`, `request_id`, emit_patch `payload`를 correlator에 전달. `registerRecoveryEnvelopeFromEmitPatchAccept`의 `acceptedExternalId`는 **accepted_external_id 우선**, 없으면 external_run_id.
- **Ingress 기록**: `recordCosCursorWebhookIngressSafe`에 **`ingress_callback_gate`**. 거절 `rejection_reason`은 v13.64에서 `pickCursorWebhookInsufficientRejectionReason` 기준으로 갱신됨(`callback_request_id_requires_path_fingerprint_pair` 등).
- **환경**: `.env.example`에 `CURSOR_WEBHOOK_ACCEPTED_ID_PATH` 주석 추가.

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
git commit -m "v13.62: Cursor callback gate — accepted id, path fp correlation, run anchor"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

### SQL

Supabase 프로젝트에 `20260410120000_cos_runs_cursor_callback_anchor.sql` 적용.
