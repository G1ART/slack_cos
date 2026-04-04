#!/usr/bin/env node
/** vNext.13.5 — 프로덕션 트리에서 legacy raw-text launch import 금지 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

const LEGACY_FROM = /from\s+['"][^'"]*\/legacy\/[^'"]*['"]/;
const LEGACY_IMPORT_PAREN = /import\s*\(\s*['"][^'"]*\/legacy\/[^'"]*['"]/;

/**
 * @param {string} line
 */
function referencesLegacyModulePath(line) {
  return LEGACY_FROM.test(line) || LEGACY_IMPORT_PAREN.test(line);
}

/**
 * @param {string} dir
 * @param {string[]} acc
 */
async function walkJs(dir, acc) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walkJs(full, acc);
    else if (e.name.endsWith('.js')) acc.push(full);
  }
}

const targets = [];
for (const rel of ['src/core', 'src/founder']) {
  await walkJs(path.join(repoRoot, rel), targets);
}
targets.push(path.join(repoRoot, 'app.js'));

for (const filePath of targets) {
  const text = await fs.readFile(filePath, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!referencesLegacyModulePath(line)) continue;
    assert.fail(`${path.relative(repoRoot, filePath)}:${i + 1} — legacy import 금지:\n${line.trim()}`);
  }
}

console.log('ok: vnext13_5_no_production_import_of_legacy_launch');
