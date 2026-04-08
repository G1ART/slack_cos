/**
 * vNext.13.45 — OpenAI strict 도구 스키마 회귀 (delegate_harness_team에 packets 노출).
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getOpenAiStrictViolationsForCosTools,
  getDelegateHarnessTeamParametersSnapshot,
} from '../src/founder/runFounderDirectConversation.js';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-delegate-schema');

const strictErrs = getOpenAiStrictViolationsForCosTools();
assert.deepStrictEqual(
  strictErrs,
  [],
  `OpenAI strict schema violations:\n${strictErrs.join('\n')}`,
);

const snap = getDelegateHarnessTeamParametersSnapshot();
assert.ok(snap && snap.properties && typeof snap.properties === 'object');
const props = /** @type {Record<string, unknown>} */ (snap.properties);
assert.equal(
  Object.prototype.hasOwnProperty.call(props, 'packets'),
  true,
  'delegate_harness_team must expose packets for narrow live_patch delegate contract',
);

const h = await runHarnessOrchestration({
  objective: '아트페어 출품 준비 현황을 보는 내부 운영 툴',
  personas: ['pm', 'engineering'],
  tasks: ['요구 정리', 'MVP 범위'],
  deliverables: ['화면 목록', '데이터 모델 초안'],
  constraints: ['팀 내부용'],
});
assert.equal(h.ok, true);
assert.ok(Array.isArray(h.packets) && h.packets.length >= 1, 'packets omitted from tool call → auto envelope');

console.log('test-delegate-harness-tool-schema-strict: ok');
