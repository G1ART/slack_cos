#!/usr/bin/env node
/** PROJECT_INTAKE_SESSION_PERSIST + 임시 파일 로드/플러시 스모크 */
import { readFile, mkdtemp, rm, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import assert from 'node:assert/strict';

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'g1cos-intake-persist-'));
const intakeFile = path.join(tmpDir, 'project-intake-sessions.json');

process.env.PROJECT_INTAKE_SESSION_PERSIST = '1';
process.env.PROJECT_INTAKE_SESSIONS_FILE = intakeFile;

const m = await import('../src/features/projectIntakeSession.js');

m.clearProjectIntakeSessionsForTest();

const meta = { channel: 'CPER', thread_ts: '1744000000.pers', source_type: 'channel_mention' };
m.openProjectIntakeSession(meta, { goalLine: '영속 테스트 목표' });
await m.flushProjectIntakeSessionsToDisk();

const j1 = JSON.parse(await readFile(intakeFile, 'utf8'));
assert.equal(j1.version, 1);
assert.ok(Array.isArray(j1.entries) && j1.entries.length >= 1);
const diskKey = j1.entries[0][0];
assert.ok(typeof diskKey === 'string' && diskKey.startsWith('ch:'), diskKey);

m.clearProjectIntakeSessionsForTest();
assert.equal(m.isActiveProjectIntake(meta), false);

await writeFile(
  intakeFile,
  JSON.stringify(
    {
      version: 1,
      savedAt: new Date().toISOString(),
      entries: [
        [
          diskKey,
          {
            stage: 'active',
            goalLine: 'from disk',
            openedAt: '2026-03-27T00:00:00.000Z',
            updatedAt: '2026-03-27T00:00:00.000Z',
          },
        ],
      ],
    },
    null,
    0,
  ),
  'utf8'
);

await m.loadProjectIntakeSessionsFromDisk();
const reMeta = { channel: 'CPER', thread_ts: '1744000000.pers', source_type: 'channel_mention' };
assert.equal(m.isActiveProjectIntake(reMeta), true);
assert.equal(m.getProjectIntakeSession(reMeta)?.goalLine, 'from disk');

m.clearProjectIntakeSessionsForTest();
await rm(tmpDir, { recursive: true, force: true });
delete process.env.PROJECT_INTAKE_SESSIONS_FILE;
process.env.PROJECT_INTAKE_SESSION_PERSIST = '0';
console.log('ok: project intake persist');
