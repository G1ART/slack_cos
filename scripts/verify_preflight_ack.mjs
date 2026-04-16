#!/usr/bin/env node
/**
 * W0: 매니페스트·디스크·인지(ack) 파일 정합 검증 (fail-closed).
 * 사용: node scripts/verify_preflight_ack.mjs --manifest ops/preflight_manifest/<task>.json --ack ops/preflight_ack/<ack>.json
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const MIN_SUMMARY = 20;
const PLACEHOLDER = /^(todo|tbd|read\s+and\s+understood|숙지함|확인함)\.?$/i;

function parseArgs(argv) {
  const out = { manifest: '', ack: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = String(argv[++i] || '');
    else if (a === '--ack') out.ack = String(argv[++i] || '');
  }
  return out;
}

function normalizeText(raw) {
  return String(raw || '').replace(/\r\n/g, '\n');
}

function sha256OfRange(absPath, startLine, endLine) {
  const text = normalizeText(fs.readFileSync(absPath, 'utf8'));
  const lines = text.split('\n');
  const slice = lines.slice(startLine - 1, endLine);
  const body = slice.join('\n');
  return crypto.createHash('sha256').update(body, 'utf8').digest('hex');
}

const args = parseArgs(process.argv);
if (!args.manifest || !args.ack) {
  console.error('Usage: node scripts/verify_preflight_ack.mjs --manifest <path> --ack <path>');
  process.exit(2);
}

const manifestPath = path.isAbsolute(args.manifest) ? args.manifest : path.join(REPO_ROOT, args.manifest);
const ackPath = path.isAbsolute(args.ack) ? args.ack : path.join(REPO_ROOT, args.ack);
if (!fs.existsSync(manifestPath)) {
  console.error('[verify_preflight_ack] missing manifest:', manifestPath);
  process.exit(1);
}
if (!fs.existsSync(ackPath)) {
  console.error('[verify_preflight_ack] missing ack:', ackPath);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const ack = JSON.parse(fs.readFileSync(ackPath, 'utf8'));
assert.equal(manifest.schema_version, 1, 'manifest schema');
assert.equal(ack.schema_version, 1, 'ack schema');

const ackChunks = Array.isArray(ack.chunks) ? ack.chunks : [];
function findAckChunk(path, start, end) {
  return ackChunks.find((x) => x.path === path && x.start_line === start && x.end_line === end) || null;
}

for (const c of manifest.chunks || []) {
  const abs = path.join(REPO_ROOT, c.path);
  if (!fs.existsSync(abs)) {
    console.error('[verify_preflight_ack] doc missing on disk:', c.path);
    process.exit(1);
  }
  const live = sha256OfRange(abs, c.start_line, c.end_line);
  if (live !== c.sha256) {
    console.error(
      `[verify_preflight_ack] STALE manifest or doc changed: ${c.path} L${c.start_line}-${c.end_line} expected ${c.sha256} got ${live} — rerun preflight_required_docs.mjs`,
    );
    process.exit(1);
  }
  const ac = findAckChunk(c.path, c.start_line, c.end_line);
  if (!ac) {
    console.error(`[verify_preflight_ack] missing ack entry for ${c.path} L${c.start_line}-${c.end_line}`);
    process.exit(1);
  }
  if (ac.sha256 !== c.sha256) {
    console.error(`[verify_preflight_ack] sha mismatch in ack for ${c.path} L${c.start_line}-${c.end_line}`);
    process.exit(1);
  }
  if (ac.acknowledged !== true) {
    console.error(`[verify_preflight_ack] chunk not acknowledged: ${c.path} L${c.start_line}-${c.end_line}`);
    process.exit(1);
  }
  const sum = String(ac.summary || '').trim();
  if (sum.length < MIN_SUMMARY || PLACEHOLDER.test(sum)) {
    console.error(
      `[verify_preflight_ack] summary too short or placeholder: ${c.path} L${c.start_line}-${c.end_line} (min ${MIN_SUMMARY} chars, factual text required)`,
    );
    process.exit(1);
  }
}

console.log('verify_preflight_ack: ok —', (manifest.chunks || []).length, 'chunks verified');
