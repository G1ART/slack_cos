#!/usr/bin/env node
/**
 * calendar_build_thread_must_not_render_council_memo_on_turn2
 * 턴2는 spec mutation → execution_ready 패킷; Council/업무등록 시그니처 금지.
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-cal-build-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');

const { openProjectIntakeSession, clearProjectIntakeSessionsForTest, getProjectIntakeSession } =
  await import('../src/features/projectIntakeSession.js');
const { tryFinalizeProjectSpecBuildThread, buildZoneOutputContainsBanned } = await import(
  '../src/features/projectSpecSession.js'
);

const meta = { channel: 'CCAL', thread_ts: '1744000000.cal', source_type: 'channel_mention', user: 'UOWNER' };

const turn1Goal = '더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';

const turn2 = [
  'MVP 가정 정확',
  '미래 외부 블랙아웃 링크',
  '미래 가격/결제 트리거',
  '개인/팀 일정 우선',
  '반복 일정 필요',
  '승인 규칙',
  '기존 타임블럭 충돌',
  '대표 일정',
  '외부 일정',
  '진행해줘',
].join('\n');

clearProjectIntakeSessionsForTest();
openProjectIntakeSession(meta, { goalLine: turn1Goal });

const routerCtx = { raw_text: turn2, normalized_text: turn2 };

const out = await tryFinalizeProjectSpecBuildThread({
  trimmed: turn2,
  metadata: meta,
  routerCtx,
  previewOnly: true,
});

assert.ok(out && out.text, 'expected spec thread finalize');
assert.equal(out.kind, 'execution_ready');
assert.equal(out.response_type, 'project_spec_execution_ready');
assert.ok(out.text.includes('잠긴 MVP'), 'execution_ready title');

const bannedSnippets = [
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장',
  '핵심 리스크',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '실행 작업 후보',
  '업무등록:',
];
for (const b of bannedSnippets) {
  assert.ok(!out.text.includes(b), `forbidden council/operator snippet: ${b}`);
}
assert.equal(buildZoneOutputContainsBanned(out.text), false);

const sess = getProjectIntakeSession(meta);
assert.ok(sess?.spec, 'spec on session');
assert.equal(sess.spec.proceed_requested, true);
/** @type {string[]} */
const fb = sess.spec.future_phase_backlog || [];
assert.ok(fb.length >= 2, 'future backlog quarantined');
assert.ok(fb.some((x) => /블랙아웃|외부/u.test(x)));
assert.ok(fb.some((x) => /결제|가격/u.test(x)));
assert.ok((sess.spec.approval_rules || []).length >= 3);

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
clearProjectIntakeSessionsForTest();
delete process.env.COS_WORKSPACE_QUEUE_FILE;
console.log('ok: calendar build thread turn2 no council memo');
