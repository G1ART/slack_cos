#!/usr/bin/env node
/** `cosWorkspaceQueue` append + list 스모크 (임시 JSON 파일) */
import { rm, mkdtemp } from 'fs/promises';
import path from 'path';
import os from 'os';
import assert from 'node:assert/strict';

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'g1cos-wsq-'));
const qFile = path.join(tmpDir, 'cos-workspace-queue.json');

const {
  appendWorkspaceQueueItem,
  listWorkspaceQueueRecent,
  formatWorkspaceQueueSaved,
  tryParseNaturalWorkspaceQueueIntake,
} = await import('../src/features/cosWorkspaceQueue.js');
const {
  encodeDialogQueuePayload,
  decodeDialogQueuePayload,
  shouldOfferWorkspaceQueueButtons,
} = await import('../src/slack/dialogQueueConfirmBlocks.js');

assert.equal(tryParseNaturalWorkspaceQueueIntake('실행큐: 수동 접두'), null);
let p = tryParseNaturalWorkspaceQueueIntake('실행큐에 올려줘:\n새 대시보드');
assert.ok(p && p.kind === 'spec_intake' && p.body.includes('대시보드'), p);
p = tryParseNaturalWorkspaceQueueIntake('실행큐에 올려줘\n\n결제 연동 초안');
assert.ok(p && p.kind === 'spec_intake' && p.body.includes('결제'), p);
p = tryParseNaturalWorkspaceQueueIntake('고객피드백으로 저장: 로그인 느림');
assert.ok(p && p.kind === 'customer_feedback' && p.body.includes('로그인'), p);
p = tryParseNaturalWorkspaceQueueIntake('피드백 큐에 넣어줘\n앱이 자꾸 꺼져요');
assert.ok(p && p.kind === 'customer_feedback', p);
p = tryParseNaturalWorkspaceQueueIntake('제품 피드백 저장해줘\n결제 오류 문구가 이상해요');
assert.ok(p && p.kind === 'customer_feedback' && p.body.includes('결제'), p);
p = tryParseNaturalWorkspaceQueueIntake('사용자 피드백 기록해줘\n로그인 두 번');
assert.ok(p && p.kind === 'customer_feedback' && p.body.includes('로그인'), p);
assert.equal(tryParseNaturalWorkspaceQueueIntake('실행큐에 올려줘')?.body || '', '');

const enc = encodeDialogQueuePayload({ kind: 'spec_intake', body: '테스트 본문 ' + 'x'.repeat(100) });
assert.ok(enc.length < 2000, enc.length);
const dec = decodeDialogQueuePayload(enc);
assert.ok(dec && dec.kind === 'spec_intake' && dec.body.includes('테스트'), dec);
assert.equal(shouldOfferWorkspaceQueueButtons('안녕하세요'), false);
assert.equal(shouldOfferWorkspaceQueueButtons('Slack에서 새 결제 대시보드를 만들고 싶은데 범위를 어떻게 잡을지'), true);
process.env.SLACK_DIALOG_QUEUE_BUTTONS = '0';
assert.equal(shouldOfferWorkspaceQueueButtons('Slack에서 새 결제 대시보드를 만들고 싶은데 범위를 어떻게 잡을지'), false);
delete process.env.SLACK_DIALOG_QUEUE_BUTTONS;

const a = await appendWorkspaceQueueItem(
  {
    kind: 'spec_intake',
    body: '새 툴: 결제 웹훅 브리지',
    metadata: { user: 'U_TEST' },
    channelContext: null,
  },
  qFile
);
assert.ok(a.id.startsWith('CWS-'), a.id);
assert.equal(a.kind, 'spec_intake');

const b = await appendWorkspaceQueueItem(
  {
    kind: 'customer_feedback',
    body: '고객: 로그인이 느려요',
    metadata: {},
    channelContext: null,
  },
  qFile
);
assert.ok(b.id.startsWith('CFB-'), b.id);

const specList = await listWorkspaceQueueRecent('spec_intake', 10, qFile);
assert.equal(specList.length, 1);
assert.equal(specList[0].id, a.id);

const fbList = await listWorkspaceQueueRecent('customer_feedback', 10, qFile);
assert.equal(fbList.length, 1);

const txt = formatWorkspaceQueueSaved(a);
assert.ok(txt.includes('CWS-'), txt);
assert.ok(txt.includes('실행 큐'), txt);

await rm(tmpDir, { recursive: true, force: true });
console.log('ok: workspace queue intake');
