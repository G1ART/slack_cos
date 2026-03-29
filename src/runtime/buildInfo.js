/**
 * Runtime build stamp — exact SHA, branch, PID, hostname, started_at.
 * Cloud env vars first; fallback to `git rev-parse HEAD` only if available.
 */

import { execSync } from 'child_process';
import os from 'os';
import { getRuntimeMode } from './env.js';

const STARTED_AT = new Date().toISOString();

function resolveReleaseSha() {
  const envCandidates = [
    'RELEASE_SHA',
    'GIT_SHA',
    'VERCEL_GIT_COMMIT_SHA',
    'RENDER_GIT_COMMIT',
    'RAILWAY_GIT_COMMIT_SHA',
  ];
  for (const key of envCandidates) {
    const v = (process.env[key] || '').trim();
    if (v) return v;
  }
  const flyRef = (process.env.FLY_IMAGE_REF || '').trim();
  if (flyRef) return flyRef;

  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 4000 }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveBranch() {
  const envCandidates = [
    'GIT_BRANCH',
    'VERCEL_GIT_COMMIT_REF',
    'RENDER_GIT_BRANCH',
    'RAILWAY_GIT_BRANCH',
  ];
  for (const key of envCandidates) {
    const v = (process.env[key] || '').trim();
    if (v) return v;
  }
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', timeout: 4000 }).trim();
  } catch {
    return 'unknown';
  }
}

let _cached = null;

export function getBuildInfo() {
  if (_cached) return _cached;
  const sha = resolveReleaseSha();
  _cached = {
    release_sha: sha,
    release_sha_short: sha.length >= 7 ? sha.slice(0, 7) : sha,
    branch: resolveBranch(),
    started_at: STARTED_AT,
    pid: process.pid,
    hostname: os.hostname(),
    runtime_mode: getRuntimeMode(),
  };
  return _cached;
}

export function formatBuildBanner() {
  const b = getBuildInfo();
  return `[G1COS BOOT] sha=${b.release_sha_short} branch=${b.branch} pid=${b.pid} started_at=${b.started_at} runtime=${b.runtime_mode} hostname=${b.hostname}`;
}
