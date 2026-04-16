/**
 * W4 — founder 표면 텍스트에 run_id / packet_id / emit_patch / lease / callback / raw JSON 등의
 *       내부 런타임 용어가 누출되지 않아야 한다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_8',
  run_id: 'run_deadbeef',
  thread_key: 'dm:C8',
  status: 'blocked',
  workcell_runtime: {
    status: 'blocked',
    escalation_state: {
      status: 'blocked',
      reasons: ['callback_absence_within_timeout', 'emit_patch_blocked', '외부 팀 응답 대기'],
    },
    summary_lines: [
      'packet_id=pkt_17 owner=pm',
      'dispatch_id=disp_1 lease=ok',
      '외부 팀 응답을 기다리고 있어요.',
    ],
  },
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C8',
  modelText: '상황을 정리해 볼게요.',
  activeRunShell: shell,
  readModel: { workcell_summary_lines: shell.workcell_runtime.summary_lines },
});

// 자연어 reason 이 있을 때만 blocker_reason 이 채워지고, machine 토큰은 절대 저장되지 않는다.
if (sm.blocker_reason) {
  assert.ok(
    !/callback_absence_within_timeout|emit_patch_blocked/.test(sm.blocker_reason),
    `machine token leaked into blocker_reason: ${sm.blocker_reason}`,
  );
}
for (const line of sm.evidence_lines) {
  assert.ok(!/packet_id|dispatch_id|lease|emit_patch|run_id|callback/.test(line), `jargon leaked: ${line}`);
}

const r = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '외부 팀 쪽에서 회신이 늦어지고 있어요. 상태 추적 중이에요.',
});

const forbidden = [
  'run_id',
  'packet_id',
  'dispatch_id',
  'emit_patch',
  'lease',
  'callback',
  'webhook',
  'harness_dispatch',
  'invoke_external_tool',
  '{"',
  '}":',
];
for (const kw of forbidden) {
  assert.ok(!r.text.includes(kw), `founder surface leaked internal jargon: ${kw}\n---\n${r.text}`);
}
assert.ok(r.text.startsWith('현재 진행이 막혀 있습니다.'), 'blocked header present');

console.log('test-founder-surface-no-internal-jargon: ok');
