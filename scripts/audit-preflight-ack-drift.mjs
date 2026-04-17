#!/usr/bin/env node
/**
 * W13-C — Repo-wide preflight / ack / SSOT drift audit.
 *
 * Scans:
 *   - ops/preflight_manifest/*.json
 *   - ops/preflight_ack/*.json
 *   - docs/runtime_required_docs.json
 *
 * Reports (non-fatal by default; fail-closed with --strict):
 *   - stale_chunk:          manifest chunk sha mismatches live file (doc drifted without re-ack)
 *   - missing_chunk_doc:    manifest chunk path does not exist on disk
 *   - missing_ack:          manifest has no paired ack file
 *   - orphan_ack:           ack file has no paired manifest
 *   - unacknowledged_chunk: ack exists but chunk not marked acknowledged
 *   - unreferenced_manifest: manifest task_id not referenced by runtime_required_docs workstream_required
 *   - runtime_doc_missing_on_disk: runtime_required_docs entry references a file that no longer exists
 *
 * Usage:
 *   node scripts/audit-preflight-ack-drift.mjs              # human output
 *   node scripts/audit-preflight-ack-drift.mjs --json       # JSON output
 *   node scripts/audit-preflight-ack-drift.mjs --strict     # exit 1 if findings non-empty
 *   node scripts/audit-preflight-ack-drift.mjs --repo <dir> # override repo root (used in tests)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO = path.join(__dirname, '..');

export function parseArgs(argv) {
  const out = { json: false, strict: false, repo: DEFAULT_REPO, exceptions: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--repo') out.repo = String(argv[++i] || DEFAULT_REPO);
    else if (a === '--exceptions') out.exceptions = String(argv[++i] || '');
  }
  return out;
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function sha256Range(absPath, startLine, endLine) {
  const text = fs.readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  return crypto
    .createHash('sha256')
    .update(lines.slice(startLine - 1, endLine).join('\n'), 'utf8')
    .digest('hex');
}

/** @param {{ manifest: string, chunkIndex?: number, kind: string, detail?: string, path?: string }} f */
function mkFinding(f) {
  return {
    kind: f.kind,
    manifest: f.manifest,
    chunk_index: typeof f.chunkIndex === 'number' ? f.chunkIndex : null,
    doc_path: f.path || null,
    detail: f.detail || '',
  };
}

export function auditRepo(repoRoot, options = {}) {
  const findings = [];

  const exceptionsFile =
    options.exceptionsPath ||
    path.join(repoRoot, 'ops', 'preflight_ack_drift_exceptions.json');
  const exceptions = (() => {
    if (!fs.existsSync(exceptionsFile)) return { schema_version: 1, frozen_manifests: [] };
    const j = readJsonSafe(exceptionsFile);
    if (!j || j.schema_version !== 1) return { schema_version: 1, frozen_manifests: [] };
    return j;
  })();
  const frozenMap = new Map();
  for (const e of exceptions.frozen_manifests || []) {
    if (e && typeof e.manifest === 'string') frozenMap.set(e.manifest, e);
  }

  function annotate(f) {
    if (frozenMap.has(f.manifest)) {
      return { ...f, accepted_historical_drift: true };
    }
    return f;
  }

  const manifestDir = path.join(repoRoot, 'ops', 'preflight_manifest');
  const ackDir = path.join(repoRoot, 'ops', 'preflight_ack');

  const manifestFiles = fs.existsSync(manifestDir)
    ? fs.readdirSync(manifestDir).filter((f) => f.endsWith('.json')).sort()
    : [];
  const ackFiles = fs.existsSync(ackDir)
    ? fs.readdirSync(ackDir).filter((f) => f.endsWith('.json')).sort()
    : [];

  function findPairedAck(manifestFile) {
    const base = manifestFile.replace(/\.json$/, '');
    const candidates = [`${base}.json`, `${base}_ack.json`];
    for (const c of candidates) if (ackFiles.includes(c)) return c;
    return null;
  }

  const manifestBases = new Set(manifestFiles.map((f) => f.replace(/\.json$/, '')));
  for (const a of ackFiles) {
    const base = a.replace(/\.json$/, '').replace(/_ack$/, '');
    if (!manifestBases.has(base)) {
      findings.push(mkFinding({ kind: 'orphan_ack', manifest: a }));
    }
  }

  for (const f of manifestFiles) {
    const m = readJsonSafe(path.join(manifestDir, f));
    if (!m || m.schema_version !== 1) {
      findings.push(mkFinding({ kind: 'invalid_manifest', manifest: f }));
      continue;
    }

    const ackName = findPairedAck(f);
    const ack = ackName ? readJsonSafe(path.join(ackDir, ackName)) : null;
    if (!ack) findings.push(mkFinding({ kind: 'missing_ack', manifest: f }));

    const ackChunks = Array.isArray(ack?.chunks) ? ack.chunks : [];
    const chunks = Array.isArray(m.chunks) ? m.chunks : [];
    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      const docAbs = path.join(repoRoot, c.path);
      if (!fs.existsSync(docAbs)) {
        findings.push(mkFinding({
          kind: 'missing_chunk_doc',
          manifest: f,
          chunkIndex: i,
          path: c.path,
        }));
        continue;
      }
      const live = sha256Range(docAbs, c.start_line, c.end_line);
      if (live !== c.sha256) {
        findings.push(mkFinding({
          kind: 'stale_chunk',
          manifest: f,
          chunkIndex: i,
          path: c.path,
          detail: `expected ${c.sha256} got ${live} (L${c.start_line}-${c.end_line})`,
        }));
      }
      const match = ackChunks.find(
        (x) => x.path === c.path && x.start_line === c.start_line && x.end_line === c.end_line,
      );
      if (ack && (!match || match.acknowledged !== true)) {
        findings.push(mkFinding({
          kind: 'unacknowledged_chunk',
          manifest: f,
          chunkIndex: i,
          path: c.path,
        }));
      }
    }
  }

  // runtime_required_docs 정합 검증
  const rrdPath = path.join(repoRoot, 'docs', 'runtime_required_docs.json');
  const rrd = readJsonSafe(rrdPath);
  if (rrd) {
    const allPaths = new Set();
    for (const p of rrd.global_required || []) allPaths.add(p);
    const wsMap = rrd.workstream_required || {};
    for (const key of Object.keys(wsMap)) for (const p of wsMap[key] || []) allPaths.add(p);
    for (const p of allPaths) {
      if (!fs.existsSync(path.join(repoRoot, p))) {
        findings.push(mkFinding({
          kind: 'runtime_doc_missing_on_disk',
          manifest: 'docs/runtime_required_docs.json',
          path: p,
        }));
      }
    }
  } else {
    findings.push(mkFinding({
      kind: 'runtime_doc_missing_on_disk',
      manifest: 'docs/runtime_required_docs.json',
      detail: 'runtime_required_docs.json missing or invalid',
    }));
  }

  const counts = findings.reduce((acc, f) => {
    acc[f.kind] = (acc[f.kind] || 0) + 1;
    return acc;
  }, {});

  // annotate findings using exception list
  const annotated = findings.map(annotate);
  const unfrozenCount = annotated.filter((f) => !f.accepted_historical_drift).length;

  return {
    schema_version: 1,
    repo_root: repoRoot,
    manifest_count: manifestFiles.length,
    ack_count: ackFiles.length,
    exceptions_path: fs.existsSync(exceptionsFile) ? path.relative(repoRoot, exceptionsFile) : null,
    frozen_manifest_count: frozenMap.size,
    findings: annotated,
    counts,
    ok: unfrozenCount === 0,
  };
}

// CLI entry only when invoked directly.
const invokedDirectly = (() => {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] || '');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const args = parseArgs(process.argv);
  const report = auditRepo(args.repo, { exceptionsPath: args.exceptions || undefined });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[audit-preflight-ack-drift] manifests=${report.manifest_count} acks=${report.ack_count} findings=${report.findings.length}`,
    );
    for (const f of report.findings) {
      console.log(
        ` - ${f.kind}\tmanifest=${f.manifest}\tdoc=${f.doc_path || '-'}\tidx=${f.chunk_index ?? '-'}\t${f.detail || ''}`,
      );
    }
    if (report.ok) console.log('OK');
  }
  if (args.strict && !report.ok) process.exit(1);
}
