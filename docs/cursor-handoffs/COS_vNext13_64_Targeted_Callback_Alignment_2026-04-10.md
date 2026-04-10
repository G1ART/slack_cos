# vNext.13.64 — Targeted callback mechanism alignment

## 요약

- **응답 필드 진실**: `extractAutomationResponseFields`가 `run_id_source`, `accepted_external_id_source`, `status_source`, `url_source`, `branch_source`(`override`|`heuristic`|`absent`) 및 `automation_response_env_absent_notes`(오버라이드 미설정·값 없음 안전 메모)를 반환. `buildSafeTriggerSmokeDetail`에 동일 키로 노출.
- **콜백 최소 근거**: `request_id` 단독은 정규화 실패. `request_id` + `paths_touched` 지문 쌍이면 정규화 통과 가능; 상관은 기존처럼 `automation_request_path_fp` 내구 행 필요. `buildCursorCallbackInsufficientDiagnostics`에 `request_id_present`, `path_fingerprint_present`, `callback_missing_basis`, `request_id_without_path_fingerprint` 등 명시.
- **거절 사유**: `request_id`만 있는 경우 `callback_request_id_requires_path_fingerprint_pair`; 그 외 `normalization_requires_closeable_callback_basis`.
- **GitHub 2차 복구**: `runGithubPushRecoveryLoop`가 `getRunById`로 `cursor_callback_anchor.emit_patch_requested_paths`를 보충(봉투 `requested_paths` 비어 있을 때). 트리거 앵커의 `automation_branch_raw`와 푸시 `ref`가 둘 다 있으면 느슨한 브랜치 호환 실패 시 스킵.
- **앵커 저장**: `recordCursorCloudCorrelation`이 `emit_patch_requested_paths`, `automation_branch_raw`를 `cursor_callback_anchor`에 포함. `toolsBridge`가 `automation_branch_raw` 전달.
- **세션 요약**: `cursor_trigger_recorded` + `trigger_ok`인 모든 수락 시도가 `emit_patch`뿐 아니라 `create_spec` 등에서도 `blocked_reason` / `machine_hint` / `primary_blocked_reason`을 상단에서 비움(오래된 `create_spec_disallowed…` 오염 완화).
- **유틸**: `cursorEnvParsingTruth.js` — `deriveAutomationResponseWinningSource` 등.

## 테스트

- `scripts/test-v13-64-callback-normalization-and-correlation.mjs`
- `scripts/test-v13-64-github-push-recovery-uses-run-anchor-paths.mjs`
- `scripts/test-v13-64-summary-accepted-automation-suppresses-stale-block.mjs`

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
git commit -m "v13.64: targeted callback alignment — sources, request_id+fp, anchor recovery, summary"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

### SQL

이번 패치에 SQL 없음.
