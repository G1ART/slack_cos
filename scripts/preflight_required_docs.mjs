#!/usr/bin/env node
/**
 * W0: 필독 문서 매니페스트 생성 + (선택) 인지(ack) 템플릿 초안.
 * 사용: node scripts/preflight_required_docs.mjs --task-id <id> [--workstream <key>] [--chunk-lines 48] [--write-ack-template <path>]
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = { taskId: '', workstream: '', chunkLines: 48, writeAckTemplate: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task-id') out.taskId = String(argv[++i] || '');
    else if (a === '--workstream') out.workstream = String(argv[++i] || '');
    else if (a === '--chunk-lines') out.chunkLines = Math.max(8, Math.min(200, Number(argv[++i]) || 48));
    else if (a === '--write-ack-template') out.writeAckTemplate = String(argv[++i] || '');
  }
  return out;
}

function loadRegistry() {
  const p = path.join(REPO_ROOT, 'docs', 'runtime_required_docs.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(j.schema_version, 1, 'runtime_required_docs.json schema_version');
  return j;
}

function uniquePathsOrdered(paths) {
  const seen = new Set();
  const out = [];
  for (const rel of paths) {
    const k = String(rel || '').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function collectPaths(registry, workstream) {
  const g = Array.isArray(registry.global_required) ? registry.global_required : [];
  if (!workstream) return uniquePathsOrdered(g);
  const map = registry.workstream_required && typeof registry.workstream_required === 'object' ? registry.workstream_required : {};
  const extra = map[workstream];
  if (!Array.isArray(extra)) {
    const keys = Object.keys(map).sort();
    throw new Error(`unknown workstream "${workstream}". Known: ${keys.join(', ')}`);
  }
  return uniquePathsOrdered([...g, ...extra]);
}

function normalizeText(raw) {
  return String(raw || '').replace(/\r\n/g, '\n');
}

function chunkFile(relPath, chunkLines) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) throw new Error(`missing required doc: ${relPath}`);
  const text = normalizeText(fs.readFileSync(abs, 'utf8'));
  const lines = text.split('\n');
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkLines) {
    const slice = lines.slice(i, i + chunkLines);
    const body = slice.join('\n');
    const startLine = i + 1;
    const endLine = i + slice.length;
    const sha256 = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
    chunks.push({
      path: relPath,
      start_line: startLine,
      end_line: endLine,
      line_count: slice.length,
      sha256,
    });
  }
  if (chunks.length === 0) {
    const sha256 = crypto.createHash('sha256').update('', 'utf8').digest('hex');
    chunks.push({ path: relPath, start_line: 1, end_line: 1, line_count: 0, sha256 });
  }
  return chunks;
}

const args = parseArgs(process.argv);
if (!args.taskId.trim()) {
  console.error(
    'Usage: node scripts/preflight_required_docs.mjs --task-id <id> [--workstream <key>] [--chunk-lines 48] [--write-ack-template <path>]',
  );
  process.exit(2);
}

const registry = loadRegistry();
const relPaths = collectPaths(registry, args.workstream.trim());
/** @type {Array<{ path: string, start_line: number, end_line: number, line_count: number, sha256: string }>} */
const allChunks = [];
for (const rel of relPaths) {
  allChunks.push(...chunkFile(rel, args.chunkLines));
}

const manifest = {
  schema_version: 1,
  task_id: args.taskId.trim(),
  workstream: args.workstream.trim() || null,
  chunk_line_size: args.chunkLines,
  generated_at: new Date().toISOString(),
  repo_root: REPO_ROOT,
  required_paths: relPaths,
  chunks: allChunks,
};

const manifestDir = path.join(REPO_ROOT, 'ops', 'preflight_manifest');
fs.mkdirSync(manifestDir, { recursive: true });
const manifestPath = path.join(manifestDir, `${args.taskId.trim()}.json`);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log('preflight_required_docs: wrote', path.relative(REPO_ROOT, manifestPath));
console.log('  chunks:', allChunks.length, 'paths:', relPaths.length);

if (args.writeAckTemplate) {
  const ackPath = path.isAbsolute(args.writeAckTemplate)
    ? args.writeAckTemplate
    : path.join(REPO_ROOT, args.writeAckTemplate);
  const ackDir = path.dirname(ackPath);
  fs.mkdirSync(ackDir, { recursive: true });
  const ack = {
    schema_version: 1,
    task_id: args.taskId.trim(),
    preflight_manifest: path.relative(REPO_ROOT, manifestPath),
    created_at: new Date().toISOString(),
    instruction:
      '각 청크에 대해 문서를 실제로 읽고, acknowledged 를 true 로 바꾼 뒤 summary 에 해당 줄 범위의 사실만 짧게 적는다(막연한 "숙지함" 금지). 완료 후 npm run verify:preflight-ack -- --manifest ... --ack ...',
    chunks: allChunks.map((c) => ({
      path: c.path,
      start_line: c.start_line,
      end_line: c.end_line,
      sha256: c.sha256,
      acknowledged: false,
      summary: '',
    })),
  };
  fs.writeFileSync(ackPath, JSON.stringify(ack, null, 2), 'utf8');
  console.log('preflight_required_docs: wrote ack template', path.relative(REPO_ROOT, ackPath));
}
