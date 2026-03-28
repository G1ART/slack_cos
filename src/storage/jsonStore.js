import fs from 'fs/promises';

import {
  DATA_DIR,
  CURSOR_HANDOFFS_DIR,
  DECISIONS_FILE,
  LESSONS_FILE,
  INTERACTIONS_FILE,
  CHANNELS_FILE,
  APPROVALS_FILE,
  WORK_ITEMS_FILE,
  PROJECT_CONTEXT_FILE,
  WORK_RUNS_FILE,
  AUTOMATION_SETTINGS_FILE,
  REPO_REGISTRY_FILE,
  SUPABASE_REGISTRY_FILE,
  ENV_PROFILES_FILE,
  ENV_CONTEXT_FILE,
  PLANS_FILE,
  resolveCosWorkspaceQueuePath,
  resolveThreadDecisionTailPath,
  resolveAgentWorkQueuePath,
} from './paths.js';

export async function ensureJsonFile(filePath, defaultValue = '[]') {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, defaultValue, 'utf8');
  }
}

export async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CURSOR_HANDOFFS_DIR, { recursive: true });

  await ensureJsonFile(DECISIONS_FILE, '[]');
  await ensureJsonFile(LESSONS_FILE, '[]');
  await ensureJsonFile(INTERACTIONS_FILE, '[]');
  await ensureJsonFile(CHANNELS_FILE, '{}');
  await ensureJsonFile(APPROVALS_FILE, '[]');
  await ensureJsonFile(WORK_ITEMS_FILE, '[]');
  await ensureJsonFile(PROJECT_CONTEXT_FILE, '{}');
  await ensureJsonFile(WORK_RUNS_FILE, '[]');
  await ensureJsonFile(PLANS_FILE, '[]');
  await ensureJsonFile(resolveCosWorkspaceQueuePath(), '[]');
  await ensureJsonFile(resolveAgentWorkQueuePath(), '[]');
  await ensureJsonFile(
    AUTOMATION_SETTINGS_FILE,
    JSON.stringify(
      {
        enabled_jobs: [],
        default_channel_by_job: {},
        default_user_by_job: {},
        schedule_stub: {},
        last_run_at_by_job: {},
      },
      null,
      2
    )
  );
  await ensureJsonFile(REPO_REGISTRY_FILE, '{}');
  await ensureJsonFile(SUPABASE_REGISTRY_FILE, '{}');
  await ensureJsonFile(ENV_PROFILES_FILE, '{}');
  await ensureJsonFile(ENV_CONTEXT_FILE, '{}');
  await ensureJsonFile(resolveThreadDecisionTailPath(), '{}');
}

async function recoverCorruptedJson(filePath, fallbackRaw) {
  const corruptPath = `${filePath}.corrupt-${Date.now()}.bak`;
  try {
    const current = await fs.readFile(filePath, 'utf8');
    await fs.writeFile(corruptPath, current, 'utf8');
  } catch {
    // ignore backup failure
  }
  await fs.writeFile(filePath, fallbackRaw, 'utf8');
}

export async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    await recoverCorruptedJson(filePath, '[]');
    return [];
  } catch {
    await ensureJsonFile(filePath, '[]');
    return [];
  }
}

export async function writeJsonArray(filePath, items) {
  await fs.writeFile(filePath, JSON.stringify(items, null, 2), 'utf8');
}

export async function appendJsonRecord(filePath, record) {
  const items = await readJsonArray(filePath);
  items.push(record);
  await writeJsonArray(filePath, items);
}

export async function readJsonObject(filePath, defaultValue = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    await recoverCorruptedJson(filePath, JSON.stringify(defaultValue, null, 2));
    return { ...defaultValue };
  } catch {
    await ensureJsonFile(filePath, JSON.stringify(defaultValue, null, 2));
    return { ...defaultValue };
  }
}

export async function writeJsonObject(filePath, value) {
  await fs.writeFile(filePath, JSON.stringify(value || {}, null, 2), 'utf8');
}

export async function getRecentRecords(filePath, count = 5) {
  const items = await readJsonArray(filePath);
  return items.slice(-count).reverse();
}

export function parseDate(value) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? t : null;
}

export async function getRecordsWithinDays(filePath, days) {
  const items = await readJsonArray(filePath);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return items.filter((item) => {
    const t = parseDate(item.created_at);
    return t !== null && t >= cutoff;
  });
}

export function tail(items, maxCount) {
  return items.slice(-maxCount);
}

