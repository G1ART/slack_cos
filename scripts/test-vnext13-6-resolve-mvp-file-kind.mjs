#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveMvpFileKind } from '../src/features/slackFileIntake.js';

const a = resolveMvpFileKind('a.pdf', 'application/pdf');
assert.equal(a.ok, true);
assert.equal(a.kind, 'pdf');

const b = resolveMvpFileKind('a.pdf', 'text/plain');
assert.equal(b.ok, false);
assert.equal(b.errorCode, 'mime_ext_mismatch');

const c = resolveMvpFileKind('a.png', 'application/pdf');
assert.equal(c.ok, false);
assert.equal(c.errorCode, 'mime_ext_mismatch');

const d = resolveMvpFileKind('deck.pdf', 'application/octet-stream');
assert.equal(d.ok, true);
assert.equal(d.kind, 'pdf');

const e = resolveMvpFileKind('x.html', 'text/html');
assert.equal(e.ok, true);
assert.equal(e.kind, 'text');

console.log('ok: vnext13_6_resolve_mvp_file_kind');
