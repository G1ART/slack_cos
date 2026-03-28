import { ENV_CONTEXT_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';
import { getStoreCore } from './core/index.js';

export async function readEnvironmentContextMap() {
  return readJsonObject(ENV_CONTEXT_FILE, {});
}

export async function writeEnvironmentContextMap(map) {
  await writeJsonObject(ENV_CONTEXT_FILE, map || {});
}

export async function getEnvironmentContext(channelId) {
  if (!channelId) return null;
  const map = await readEnvironmentContextMap();
  return map[channelId] || null;
}

export async function setEnvironmentContext(channelId, envKey) {
  if (!channelId) return;
  await getStoreCore().upsert('environment_context', { key: channelId, value: envKey });
}

export async function clearEnvironmentContext(channelId) {
  if (!channelId) return;
  await getStoreCore().remove('environment_context', channelId);
}

