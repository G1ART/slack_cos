#!/usr/bin/env node
/** vNext.13 — 승인된 제안 스냅샷에서만 플래너 capability 도출(런 텍스트 키워드 단독 경로 아님) */
import assert from 'node:assert/strict';

import {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
  getExecutionRunById,
  setRunApprovedProposalSnapshot,
} from '../src/features/executionRun.js';
import { extractRunCapabilities } from '../src/orchestration/runCapabilityExtractor.js';

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V13:cap:1',
  goal_line: '문서 초안 작성',
  locked_scope_summary: '문서',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {} });
const snap = {
  understood_request: 'x',
  cos_only_tasks: ['시장 조사 및 경쟁사 벤치마크 표'],
  internal_support_tasks: [],
  external_execution_tasks: [],
  proposed_roadmap: [],
};
setRunApprovedProposalSnapshot(run.run_id, snap);
const caps = extractRunCapabilities(getExecutionRunById(run.run_id));
assert.equal(caps.market_research, true);

const packet2 = createExecutionPacket({
  thread_key: 'ch:V13:cap:2',
  goal_line: '벤치마크',
  locked_scope_summary: '벤치마크',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run2 = createExecutionRun({ packet: packet2, metadata: {} });
const caps2 = extractRunCapabilities(run2);
assert.equal(caps2.research, false);
assert.equal(caps2.fullstack_code, false);

console.log('ok: vnext13_approved_proposal_to_capability_derivation');
