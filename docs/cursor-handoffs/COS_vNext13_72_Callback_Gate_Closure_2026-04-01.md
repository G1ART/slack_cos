# vNext.13.72 — Callback gate functional closure (provider progression + founder gate)

## Root cause (한 줄)

Dispatch·콜백 매칭은 되어도 **패킷 ID가 비어 있거나 synthetic/manual이 패킷을 밀어 올려** founder 쪽이 “완료”로 보이는 분기가 생길 수 있었고, **provider만이 1차 권위**라는 구분이 write-path에 고정되어 있지 않았다.

## Closure authority (고정)

1. **패킷·런 상태 전진** (`applyExternalCursorPacketProgressForRun`): `x-cos-callback-source`가 `synthetic_orchestrator` 또는 `manual_probe`일 때는 **적용하지 않음**. `provider_runtime`·`unknown`(실제 Cursor 등 서명만 있고 소스 헤더 없음)·그 외 비명시는 **전진 허용**.
2. **구조적 클로저 표식**: 위 전진이 실제로 일어나고 소스가 provider/unknown일 때만 `cursor_callback_anchor.provider_structural_closure_at` (+ packet id)를 merge.
3. **Founder completed**: starter kick가 `cursor` / `emit_patch` / `execution_lane === cloud_agent'`인 런은, `provider_structural_closure_at` 없이는 **completed 마일스톤·eager combined completed** 를 보내지 않음 (시작만 보내거나 대기).

## Outbound

- `triggerCursorAutomation({ completionContext })` → completion contract에 `recommended_callback_context.thread_key` / `packet_id`.
- `computeEmitPatchCursorAutomationTruth` — 계약·에코·request_id·fp 파생 한 객체.
- Cloud `emit_patch`인데 콜백 계약 미구성 → `degraded` (`emit_patch_callback_contract_not_configured`).

## 왜 이 gate를 다시 흔들면 안 되는지

이후 패치는 **동일 run/packet에 대한 단일 권위 체인**(provider 서명 콜백 → progression → anchor → founder)을 깨면, 하네스·병렬 에이전트에서 다시 비결정적 귀속이 재발한다.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.72: provider-only callback progression and founder structural closure gate"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
