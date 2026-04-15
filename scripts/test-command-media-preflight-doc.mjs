/**
 * command media SSOT 문서가 레포에 있고 필독 링크를 포함한다.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'docs', 'cursor-handoffs', 'COS_Command_Media_Preflight_2026-04-14.md');
const md = fs.readFileSync(p, 'utf8');
assert.ok(md.includes('CONSTITUTION.md'), 'links constitution');
assert.ok(md.includes('WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md'), 'links WHAT');
assert.ok(md.includes('G1_COS_Upgrade_Roadmap_2026-04-14.md'), 'links roadmap');
assert.ok(md.includes('COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md'), 'links tenancy guide');
assert.ok(md.includes('COS_Release_Readiness_Checklist_2026-04-16.md'), 'links release checklist');
assert.ok(md.includes('verify:parcel-post-office'), 'mentions parcel verify npm script');
assert.ok(md.includes('audit:parcel-health'), 'mentions parcel audit npm script');

console.log('test-command-media-preflight-doc: ok');
