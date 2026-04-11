# vNext.13.76 — Packet identity hard bind + founder completion hard gate

## What changed

1. **`canonicalExternalEvent.js`**
   - **`resolveEmitPatchAuthoritativePacketId`**: authoritative target is **only** `corr.packet_id` when it is an emit_patch packet on the run; optional **`canonical.packet_id_hint`** must **match** that id or closure is rejected (`callback_packet_id_mismatch`). No thread_key / hint-only / second-guess resolution on the commit path.
   - **`processCanonicalExternalEvent`** (cursor, direct key, non-authoritative branch): removed **`resolveEffectiveCursorPacketId`** heuristic progression; same **corr + optional hint equality** rules, then **`applyExternalCursorPacketProgressForRun`** only on that bound id.

2. **`runSupervisor.js`**
   - **`runHasAuthoritativeEmitPatchStructuralClosure`**: founder completion for cloud emit_patch requires **`cursor_dispatch_ledger.target_packet_id`**, equality with **`cursor_callback_anchor.provider_structural_closure_packet_id`**, that packet **`completed` in `packet_state_map`**, and **`run.status === 'completed'`**. Anchor alone (or GitHub/orchestrator evidence) is insufficient.

3. **Tests / fixtures**
   - `scripts/test-v13-73-authoritative-callback-closure.mjs` — empty corr packet expectation → `correlation_packet_id_required`.
   - `scripts/test-v13-74-callback-closure-spine.mjs`, `scripts/test-v13-73-exact-provider-callback-schema.mjs` — milestone runs include **`cursor_dispatch_ledger.target_packet_id`** aligned with the emit_patch packet.
   - `scripts/test-v13-76-packet-bind-completion-gate.mjs` — mismatch vs match, ledger missing, ledger≠closure, aggregate closure flags.

## SQL

없음.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git checkout main
git pull --rebase origin main
git add -A
git commit -m "v13.76: packet id hard bind + founder completion hard gate"
git pull --rebase origin main
git push origin main
```

## Follow-up (2026-04-01)

- **`processCanonicalExternalEvent`**: `emit_patch` authoritative path에서 터미널이 아닌 콜백(`non_terminal_callback_status`)은 구조적 클로저를 쓰지 않되, **`resolveEmitPatchAuthoritativePacketId`로 확정한 동일 packet_id**에 대해 **`applyExternalCursorPacketProgressForRun`**만 수행한다 (running 등).
- **테스트 정합**: `test-external-event-correlation.mjs`에 `pkt_cursor_hint` **emit_patch** 패킷을 디스패치에 포함·`packet_state_map` 정렬. `test-external-event-run-wakeup.mjs`는 **create_spec → emit_patch**, 완료 웹훅에 **`paths_touched`** 추가.
- **`test-cursor-cloud-smoke-lifecycle.mjs`**: v13.76 이전과 동일하게 콜백→슈퍼바이저 흐름을 검증하되, 패킷은 **emit_patch + paths_touched**로 맞춤.
