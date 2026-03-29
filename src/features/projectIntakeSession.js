/**
 * 킥오프(`start_project`) 직후 **sticky 인테이크 세션** — 버퍼/전사가 비어도
 * 후속 턴이 Council·dialog로 새지 않도록 런타임 소유권을 고정한다.
 *
 * 옵트인 영속: `PROJECT_INTAKE_SESSION_PERSIST=1` → `data/project-intake-sessions.json`
 * (또는 `PROJECT_INTAKE_SESSIONS_FILE`)
 */

import fs from 'fs/promises';
import path from 'path';
import { buildSlackThreadKey } from './slackConversationBuffer.js';
import { resolveProjectIntakeSessionsPath } from '../storage/paths.js';
import { createProjectSpecSession, seedSpecMvpDefaultsFromProblem } from './projectSpecModel.js';

/** @typedef {{ stage: 'active', goalLine: string, openedAt: string, updatedAt: string, spec?: Record<string, unknown> }} ProjectIntakeSession */

/** @type {Map<string, ProjectIntakeSession>} */
const sessions = new Map();

let persistTimer = null;

function persistEnabled() {
  if (process.env.PROJECT_INTAKE_SESSION_PERSIST === '0' || process.env.PROJECT_INTAKE_SESSION_PERSIST === 'false') {
    return false;
  }
  const v = String(process.env.PROJECT_INTAKE_SESSION_PERSIST || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function intakeFilePath() {
  return resolveProjectIntakeSessionsPath();
}

function schedulePersist() {
  if (!persistEnabled()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeIntakeFile().catch((e) => console.warn('[project_intake] persist failed:', e?.message || e));
  }, 450);
}

async function writeIntakeFile() {
  if (!persistEnabled()) return;
  const fp = intakeFilePath();
  const entries = [...sessions.entries()].map(([k, v]) => [k, v]);
  const payload = JSON.stringify(
    { version: 2, savedAt: new Date().toISOString(), entries },
    null,
    0,
  );
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, payload, 'utf8');
}

/**
 * `ensureStorage` 직후·부팅 시 호출.
 */
export async function loadProjectIntakeSessionsFromDisk() {
  if (!persistEnabled()) return;
  const fp = intakeFilePath();
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const data = JSON.parse(raw);
    const ver = data.version;
    if ((ver !== 1 && ver !== 2) || !Array.isArray(data.entries)) return;
    sessions.clear();
    for (const row of data.entries) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const [k, v] = row;
      if (!k || !v || v.stage !== 'active' || !v.goalLine) continue;
      const key = String(k);
      const goalLine = String(v.goalLine);
      const base = {
        stage: /** @type {'active'} */ ('active'),
        goalLine,
        openedAt: String(v.openedAt || new Date().toISOString()),
        updatedAt: String(v.updatedAt || new Date().toISOString()),
      };
      let spec = v.spec && typeof v.spec === 'object' ? { ...v.spec } : null;
      if (!spec) {
        const ownerId = '';
        spec = createProjectSpecSession(goalLine, key, ownerId);
      }
      seedSpecMvpDefaultsFromProblem(spec);
      sessions.set(key, { ...base, spec });
    }
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code !== 'ENOENT') {
      console.warn('[project_intake] load failed:', e?.message || e);
    }
  }
}

export async function flushProjectIntakeSessionsToDisk() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await writeIntakeFile();
}

/**
 * @param {Record<string, unknown>} metadata
 * @param {{ goalLine: string }} payload
 */
export function openProjectIntakeSession(metadata, payload) {
  if (!metadata || typeof metadata !== 'object') return;
  const goalLine = String(payload?.goalLine || '').trim();
  if (!goalLine) return;
  const key = buildSlackThreadKey(metadata);
  const now = new Date().toISOString();
  const ownerId = String(
    metadata?.user || metadata?.user_id || metadata?.slack_user_id || '',
  );
  const spec = createProjectSpecSession(goalLine, key, ownerId);
  seedSpecMvpDefaultsFromProblem(spec);

  sessions.set(key, {
    stage: 'active',
    goalLine,
    openedAt: now,
    updatedAt: now,
    spec,
  });
  schedulePersist();
}

/**
 * @param {Record<string, unknown>} metadata
 * @param {Record<string, unknown>} spec
 */
export function touchProjectIntakeSessionSpec(metadata, spec) {
  if (!metadata || typeof metadata !== 'object' || !spec || typeof spec !== 'object') return;
  const s = getProjectIntakeSession(metadata);
  if (!s || s.stage !== 'active') return;
  s.spec = spec;
  s.updatedAt = new Date().toISOString();
  schedulePersist();
}

/** @param {Record<string, unknown>} metadata */
export function getProjectIntakeSession(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return sessions.get(buildSlackThreadKey(metadata)) || null;
}

/** @param {Record<string, unknown>} metadata */
export function isActiveProjectIntake(metadata) {
  const s = getProjectIntakeSession(metadata);
  return Boolean(s && s.stage === 'active');
}

/** @param {Record<string, unknown>} metadata */
export function touchProjectIntakeSession(metadata) {
  const s = getProjectIntakeSession(metadata);
  if (!s || s.stage !== 'active') return;
  s.updatedAt = new Date().toISOString();
  schedulePersist();
}

/** 실행 승인(잠금) 완료 등 — 세션 제거 */
export function completeProjectIntakeSession(metadata) {
  const key = buildSlackThreadKey(metadata);
  if (sessions.delete(key)) schedulePersist();
}

/** 대표가 범위 정렬을 닫을 때 */
export function cancelProjectIntakeSession(metadata) {
  const key = buildSlackThreadKey(metadata);
  if (sessions.delete(key)) schedulePersist();
}

/** @returns {string} */
export function buildProjectIntakeCouncilDeferSurface() {
  return [
    '*[인테이크 진행 중]*',
    '',
    '이 스레드에는 **프로젝트 인테이크**(툴/프로젝트 범위 정렬·실행 승인)가 열려 있습니다.',
    '',
    '`협의모드`로 다각 논의를 열려면 먼저 **`인테이크 취소`** 한 줄을 보내 주세요. (범위를 잠근 뒤에는 인테이크가 자동으로 닫힙니다.)',
    '',
    '_내부 페르소나·Council은 인테이크가 닫힌 뒤 같은 스레드에서 다시 쓸 수 있습니다._',
  ].join('\n');
}

/**
 * 첫 줄 기준 취소 명령(다른 문장과 섞이면 무시).
 * @param {string} trimmed
 */
export function tryParseProjectIntakeCancelCommand(trimmed) {
  const raw = String(trimmed || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!raw) return false;
  const t = raw.split(/\r?\n/)[0].trim();
  const core = t.replace(/[.!…]+$/u, '').trim();
  const lower = core.toLowerCase();
  if (/^인테이크\s*취소$/u.test(core)) return true;
  if (/^프로젝트\s*인테이크\s*취소$/u.test(core)) return true;
  if (/^툴\s*인테이크\s*취소$/u.test(core)) return true;
  if (/^스펙\s*인테이크\s*취소$/u.test(core)) return true;
  if (/^MVP\s*정렬\s*취소$/u.test(core)) return true;
  if (/^킥오프\s*취소$/u.test(core)) return true;
  if (/^툴\s*킥오프\s*취소$/u.test(core)) return true;
  if (lower === 'cancel project intake' || lower === 'cancel intake') return true;
  return false;
}

/**
 * @returns {{ text: string, response_type: string } | null}
 */
export function tryFinalizeProjectIntakeCancel(trimmed, metadata) {
  if (!trimmed || !metadata || typeof metadata !== 'object') return null;
  if (!tryParseProjectIntakeCancelCommand(trimmed)) return null;

  if (!isActiveProjectIntake(metadata)) {
    return {
      text: [
        '*[인테이크 취소]*',
        '',
        '열려 있는 프로젝트 인테이크가 없습니다. (이미 잠금·종료되었거나 **이 스레드·DM**이 아닐 수 있습니다.)',
      ].join('\n'),
      response_type: 'project_intake_cancel_noop',
    };
  }

  const s = getProjectIntakeSession(metadata);
  const g = s?.goalLine
    ? `_정리하던 목표:_ ${s.goalLine.slice(0, 280)}${s.goalLine.length > 280 ? '…' : ''}\n`
    : '';
  cancelProjectIntakeSession(metadata);

  return {
    text: [
      '*[프로젝트 인테이크 취소]*',
      '',
      g,
      '범위 정렬 세션을 닫았습니다. 새로 시작하려면 `툴제작:` 등으로 다시 킥오프하면 됩니다.',
    ]
      .filter(Boolean)
      .join('\n'),
    response_type: 'project_intake_cancel',
  };
}

/** 테스트 전용 */
export function clearProjectIntakeSessionsForTest() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  sessions.clear();
}
