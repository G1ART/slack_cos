import { PROJECT_CONTEXT_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';
import { getStoreCore } from './core/index.js';

export async function readProjectContextMap() {
  return readJsonObject(PROJECT_CONTEXT_FILE, {});
}

export async function writeProjectContextMap(map) {
  await writeJsonObject(PROJECT_CONTEXT_FILE, map || {});
}

export async function getProjectContext(channelId) {
  if (!channelId) return null;
  const map = await readProjectContextMap();
  return map[channelId] || null;
}

export async function setProjectContext(channelId, projectKey) {
  if (!channelId) return;
  // dual-write v1: STORAGE_MODE=dual 일 때 JSON+Supabase 모두 write
  await getStoreCore().upsert('project_context', { key: channelId, value: projectKey });
}

export async function clearProjectContext(channelId) {
  if (!channelId) return;
  await getStoreCore().remove('project_context', channelId);
}
