import assert from 'node:assert';
import {
  renderStartedMilestone,
  renderCompletedMilestone,
  renderBlockedMilestone,
  renderReviewMilestone,
  renderFailedMilestone,
} from '../src/founder/founderCallbackCopy.js';
import { milestoneField } from '../src/founder/executionRunStore.js';

const s = renderStartedMilestone({
  objective: '아트페어 운영 툴',
  tool: 'cursor',
  action: 'create_spec',
});
assert.ok(s.includes('실행에 들어갔습니다'));
assert.ok(s.includes('cursor'));
assert.ok(s.includes('create_spec'));

const c = renderCompletedMilestone({
  objective: '아트페어 운영 툴',
  summary_lines: ['- tool_result completed / cursor:create_spec'],
});
assert.ok(c.includes('1차 실행을 마쳤습니다'));

const b = renderBlockedMilestone({ objective: '테스트', need_line: 'GITHUB_TOKEN 필요' });
assert.ok(b.includes('멈춰'));

const r = renderReviewMilestone({ objective: '테스트', lines: ['항목 A', '항목 B'] });
assert.ok(r.includes('확인이 필요'));

const f = renderFailedMilestone({ objective: '테스트' });
assert.ok(f.includes('오류'));

assert.equal(milestoneField('started'), 'founder_notified_started_at');
assert.equal(milestoneField('completed'), 'founder_notified_completed_at');

console.log('test-founder-callback-milestones: ok');
