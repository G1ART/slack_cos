/**
 * 선택적 HTTP 엔드포인트: CI/핑거 스크립트가 `proof_refs`를 AWQ에 append.
 *
 * 환경 변수:
 * - `COS_CI_HOOK_PORT` — 리슨 (설정 없으면 서버 미기동)
 * - `COS_CI_HOOK_SECRET` — POST body `secret` 과 일치해야 함
 *
 * GET `/cos/health` — 인증 없음 (터널·로드밸런서 확인용)
 *
 * POST `/cos/ci-proof` — JSON:
 * `{ "secret": "…", "proof": "한 줄", "work_queue_id": "AWQ-…" }` 또는
 * `{ "secret": "…", "proof": "…", "run_id": "RUN-…" }`
 */

import http from 'http';
import {
  appendAgentWorkQueueProofById,
  appendAgentWorkQueueProofByLinkedRun,
} from '../features/agentWorkQueue.js';

const MAX_BODY = 65536;

const HEALTH_PATHS = new Set(['/cos/health', '/cos/health/']);

/**
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
function isHealthRequest(req) {
  return req.method === 'GET' && req.url != null && HEALTH_PATHS.has(String(req.url).split('?')[0]);
}

/**
 * @param {unknown} json
 * @param {string} expectedSecret
 * @returns {Promise<{ status: number; body: string }>}
 */
export async function handleCosCiProofJson(json, expectedSecret) {
  const secret = String(expectedSecret || '');
  if (!secret) return { status: 503, body: 'COS_CI_HOOK_SECRET not configured' };
  if (!json || typeof json !== 'object') return { status: 400, body: 'invalid json' };
  const bodySecret = String((/** @type {any} */ (json)).secret ?? '');
  if (bodySecret !== secret) return { status: 401, body: 'unauthorized' };

  const proofRaw =
    (/** @type {any} */ (json)).proof ??
    (/** @type {any} */ (json)).proof_line ??
    (/** @type {any} */ (json)).message ??
    '';
  const proof = String(proofRaw || '').trim().slice(0, 4000);
  if (!proof) return { status: 400, body: 'proof required' };

  const awq = String((/** @type {any} */ (json)).work_queue_id ?? '').trim();
  const runId = String((/** @type {any} */ (json)).run_id ?? '').trim();

  let row = null;
  if (awq) {
    row = await appendAgentWorkQueueProofById(awq, `ci_hook:${proof}`);
  } else if (runId) {
    row = await appendAgentWorkQueueProofByLinkedRun(runId, `ci_hook:${proof}`);
  } else {
    return { status: 400, body: 'work_queue_id or run_id required' };
  }

  if (!row) return { status: 404, body: 'no match' };
  return {
    status: 200,
    body: JSON.stringify({ ok: true, work_queue_id: row.id }),
  };
}

/**
 * @param {string} secret — POST `/cos/ci-proof` 검증용 (`COS_CI_HOOK_SECRET`)
 * @returns {import('http').Server}
 */
export function createCosCiHookServer(secret) {
  const expected = String(secret || '').trim();
  return http.createServer((req, res) => {
    if (isHealthRequest(req)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, service: 'g1-cos-ci-hook' }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/cos/ci-proof') {
      res.writeHead(404);
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        req.destroy();
      }
    });
    req.on('end', async () => {
      try {
        let j;
        try {
          j = JSON.parse(raw || '{}');
        } catch {
          res.writeHead(400);
          res.end('invalid json');
          return;
        }
        const { status, body } = await handleCosCiProofJson(j, expected);
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(body);
      } catch (e) {
        res.writeHead(500);
        res.end(String(/** @type {any} */ (e)?.message || e));
      }
    });
  });
}

/**
 * @param {{ logger?: { log: (...a: unknown[]) => void } }} [opts]
 * @returns {import('http').Server | null}
 */
export function startCosCiHookIfConfigured(opts = {}) {
  const logger = opts.logger || console;
  const port = Number(process.env.COS_CI_HOOK_PORT || '');
  const secret = String(process.env.COS_CI_HOOK_SECRET || '').trim();
  if (!Number.isFinite(port) || port <= 0 || !secret) return null;

  const server = createCosCiHookServer(secret);
  server.listen(port, () => {
    logger.log(
      `[cos-ci-hook] listening http://0.0.0.0:${port} — GET /cos/health · POST /cos/ci-proof (secret required for POST)`
    );
  });
  return server;
}
