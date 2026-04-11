# vNext.13.74 — Callback closure spine hard reset (no synthetic, no fp-as-authority)

## What changed

1. **`cursorCloudAdapter.js`** (기존 v13.74 누적)  
   - 트리거 송장 `accepted_external_id`는 **`localTriggerRequestId`(outbound `request_id`)만** 사용.  
   - `backgroundComposerId` / `composerId` / `background_composer_id`는 **`provider_run_hint`** 전용(권위 승격 금지).

2. **`correlationStore.js`**  
   - 권위 상관 순서: `external_run_id` → `accepted_external_id` → run_uuid+packet → thread_key+packet.  
   - `automation_request_path_fp`는 **`findExternalCorrelationCursorPathFingerprintEvidence`**로만 조회(증거).

3. **`externalEventGateway.js`**  
   - 인그레스 응답에 **`matched_by`** 노출(테스트·관측).

4. **`canonicalExternalEvent.js`**  
   - emit_patch 패킷 ID: corr의 emit_patch + `packet_id_hint` 정합 시만; anchor/휴리스틱 제거.  
   - `matched_by`가 direct key 계열만 progression; fp 계열은 evidence-only.

5. **`cursorCallbackCompletionOrchestrator.js`**  
   - 합성 POST 제거; **프로바이더 서명 콜백 관측 폴링만** (`synthetic_posts` 항상 0).

6. **`smokeOps.js`**  
   - `path_fingerprint_callback_evidence_only` 조기 실패·비권위 집계.  
   - `inferSelectedExecutionLaneFromAgg`에서 제거된 synthetic `final_status` 분기 정리.

7. **`toolsBridge.js`**  
   - 오케스트레이터 상태 매핑에서 synthetic delivered 제거(이미 폴링-only와 정합).

8. **`runSupervisor.js`**  
   - v13.72/73 게이트 유지(구조적 클로저 + stale create_spec 요약 억제). 추가 env 없음.

## Tests

- `scripts/test-v13-74-callback-closure-spine.mjs` — 송장/직접키/fp-only/금지 토큰/요약 필터.  
- `scripts/test-v13-69-callback-completion-orchestrator.mjs` — 폴링-only·timeout·provider match.  
- `scripts/test-v13-71-completion-contract-and-aggregate.mjs` — synthetic 집계 비권위.  
- `scripts/test-trigger-response-background-composer-id-recorded-as-accepted-external-id.mjs` · `test-accepted-id-is-not-labeled-canonical-run-id.mjs` · `test-v13-64-callback-normalization-and-correlation.mjs` — 트리거 힌트 vs 송장 분리.

## SQL

없음.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.74: callback closure spine hard reset (direct-key only, no synthetic)"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

## Smoke (Slack live)

동일 스모크 지시로 재실행 후 수락 기준은 제품 스모크 체크리스트(직접키 상관, progression, completed 1회, stale create_spec 없음)를 따른다. 실패 시 `closure_not_applied_reason` / ops 단계 `path_fingerprint_callback_evidence_only`를 확인.
