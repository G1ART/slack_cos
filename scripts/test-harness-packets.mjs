import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { readRecentExecutionArtifacts, clearExecutionArtifacts } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-packets');

const tk = `dm:pkt-${Date.now()}`;
await clearExecutionArtifacts(tk);

const h = await runHarnessOrchestration(
  {
    objective: 'MVP 출시',
    personas: ['pm', 'engineering'],
    tasks: ['스코프', '구현'],
    deliverables: ['PRD', '코드'],
    constraints: ['2주'],
    packets: [
      {
        persona: 'pm',
        mission: '스코프 동결',
        inputs: ['founder 브리프'],
        deliverables: ['PRD 초안'],
        definition_of_done: ['승인 기준 명시'],
        handoff_to: 'engineering',
        artifact_format: 'spec_markdown',
        success_criteria: '  PRD 초안 합의  ',
      },
      {
        persona: 'engineering',
        mission: '구현',
        inputs: ['PRD'],
        deliverables: ['PR'],
        definition_of_done: ['CI 그린'],
        handoff_to: '',
        artifact_format: 'spec_markdown',
      },
    ],
  },
  { threadKey: tk },
);

assert.equal(h.ok, true);
assert.ok(Array.isArray(h.packets) && h.packets.length >= 2, 'packets array');

for (const pkt of h.packets) {
  assert.ok(pkt.packet_id && String(pkt.packet_id).startsWith('pkt_'), 'packet_id');
  assert.ok(pkt.persona, 'persona');
  assert.ok(pkt.mission, 'mission');
  assert.ok(Array.isArray(pkt.deliverables) && pkt.deliverables.length, 'deliverables');
  assert.ok(Array.isArray(pkt.definition_of_done) && pkt.definition_of_done.length, 'definition_of_done');
  assert.ok(typeof pkt.handoff_to === 'string', 'handoff_to');
  assert.ok(pkt.artifact_format, 'artifact_format');
}
const pmPkt = h.packets.find((x) => x.persona === 'pm');
assert.equal(pmPkt && pmPkt.success_criteria, 'PRD 초안 합의');

const arts = await readRecentExecutionArtifacts(tk, 50);
assert.ok(arts.some((a) => a.type === 'harness_packet'), 'ledger harness_packet');
const dispArt = arts.find((a) => a.type === 'harness_dispatch');
const dpl0 = dispArt?.payload && typeof dispArt.payload === 'object' ? dispArt.payload : {};
assert.equal(String(dpl0.thread_key || ''), tk, 'harness_dispatch ledger payload has thread_key');

await clearExecutionArtifacts(tk);

console.log('test-harness-packets: ok');
