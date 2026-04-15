/**
 * audit-parcel-ops-smoke-health JSON에 ledger product/project_space 분포 필드가 포함된다 (M6 관측 SSOT).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'audit-parcel-ops-smoke-health.mjs');
const src = fs.readFileSync(script, 'utf8');
assert.ok(src.includes('ledger_tenancy_product_top'), 'report must expose ledger_tenancy_product_top');
assert.ok(src.includes('ledger_tenancy_project_space_top'), 'report must expose ledger_tenancy_project_space_top');
assert.ok(
  src.includes('product_key, project_space_key'),
  'ledger sample select must include product_key and project_space_key',
);

console.log('test-audit-parcel-ops-smoke-ledger-tenancy-report-shape: ok');
