# vNext.13.73 — Provider callback → authoritative emit_patch closure (atomic)

## What changed

1. **`canonicalExternalEvent.js`**  
   - `provider_runtime`만 패킷 전진·`cursor_callback_anchor` 구조적 클로저 필드 기록.  
   - 터미널 버킷만 클로저 적용; 실패 시 `cursor_callback_correlated_but_closure_not_applied` + `closure_not_applied_reason`.  
   - 성공 시 `cursor_authoritative_closure_applied` (중복 콜백은 idempotent, 권위 이벤트 1회).  
   - `resolveEmitPatchAuthoritativePacketId` 결정적 순서: corr(emit_patch만) → hint → anchor.packet_id → running emit_patch 단일 후보.  
   - `shouldUseEmitPatchAuthoritativeCursorClosure`: 디스패치에 emit_patch 패킷이 있어도 **상관 packet_id가 create_spec 등 비-emit_patch면 레거시 경로**(혼합 그래프 보호).

2. **`cursorCallbackTruth.js`**  
   - 진행 허용: `provider_runtime`만.  
   - 서명 콜백에 헤더 없으면 `provider_runtime`; 내부 probe가 아닌 임의 헤더 값도 **`provider_runtime`** (v13.73b, `COS_vNext13_73b_Exact_Provider_Callback_Schema_2026-04-01.md` 참고).

3. **`providerEventCorrelator.js`**  
   - `cursor_callback_anchor.packet_id` 저장(해석 순서 3단계).

4. **`runSupervisor.js`**  
   - cloud `emit_patch` completed: `provider_structural_closure_packet_id`가 required에 있고 해당 패킷이 터미널일 때만 completed 허용.  
   - cloud emit_patch는 **항상 started 먼저**(eager combined 금지).  
   - completed 요약: `readExecutionSummaryForRun(..., { suppressStaleLiveOnlyCreateSpecLeak })`로 create_spec 차단 문구 필터.

5. **`executionLedger.js`**  
   - `filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines` + `readExecutionSummaryForRun` 옵션.

6. **`smokeOps.js`**  
   - `authoritative_callback_closure_applied` / `callback_correlated_but_closure_not_applied` 단계.  
   - Topline: `authoritative_callback_closure_applied` 우선; 인그레스만 매칭은 `provider_callback_ingress_matched_not_closed`.

## Tests

- `scripts/test-v13-73-authoritative-callback-closure.mjs`  
- `test-v13-72`·`test-v13-71` 기대값 보정.

## SQL

없음 (기존 `cursor_callback_anchor` JSON만 사용).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.73: authoritative provider callback closure for emit_patch"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
