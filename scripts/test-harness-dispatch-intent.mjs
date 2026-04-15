/**
 * M4: Phase1 `intent` / `role` — harness dispatch 단일 경로(runHarnessOrchestration).
 * Phase1 `success_criteria`: payload 배열 trim·전달 회귀.
 */
import assert from 'node:assert/strict';
import {
  deriveHarnessDispatchIntent,
  runHarnessOrchestration,
} from '../src/founder/harnessBridge.js';
import { validateDelegateHarnessTeamToolArgs } from '../src/founder/delegateHarnessPacketValidate.js';

const auto = await runHarnessOrchestration({
  objective: '릴리즈 점검',
  personas: ['pm', 'engineering'],
  tasks: ['범위', '구현'],
  deliverables: ['체크리스트'],
  constraints: ['내부'],
});
assert.equal(auto.ok, true);
assert.ok(typeof auto.intent === 'string' && auto.intent.length > 0);
assert.match(auto.intent, /^delegate_pm_engineering_/);
const p0 = auto.packets[0] && typeof auto.packets[0] === 'object' ? auto.packets[0] : {};
assert.equal(String(p0.role || ''), 'pm');
assert.equal(String(p0.persona || ''), 'pm');

const custom = await runHarnessOrchestration({
  objective: 'x',
  personas: ['qa'],
  tasks: ['검증'],
  intent: '  my.custom-label_v1  ',
});
assert.equal(custom.intent, 'my.custom-label_v1');

assert.equal(
  deriveHarnessDispatchIntent(
    {},
    'pm+design',
    /** @type {Record<string, unknown>[]} */ ([
      { preferred_tool: 'cursor', preferred_action: 'emit_patch' },
    ]),
  ),
  'delegate_pm_design_cursor_emit_patch',
);

const badIntent = validateDelegateHarnessTeamToolArgs({
  objective: 'ok',
  packets: null,
  intent: 123,
});
assert.equal(badIntent.blocked, true);

const longIntent = 'x'.repeat(201);
const badLen = validateDelegateHarnessTeamToolArgs({
  objective: 'ok',
  packets: null,
  intent: longIntent,
});
assert.equal(badLen.blocked, true);

const withCrit = await runHarnessOrchestration({
  objective: '배포',
  personas: ['pm'],
  success_criteria: ['  smoke_green  ', 'ledger_ok'],
});
assert.deepEqual(withCrit.success_criteria, ['smoke_green', 'ledger_ok']);

console.log('test-harness-dispatch-intent: ok');
