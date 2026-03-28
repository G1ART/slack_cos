import { REPO_REGISTRY_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';

const DEFAULTS = {};

export async function getRepoRegistry() {
  return readJsonObject(REPO_REGISTRY_FILE, DEFAULTS);
}

function resolveRepoEntry(entry, envKey) {
  // Backward compatible: string means default.
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  const def = entry.default || null;
  if (!envKey) return def;
  const envMap = entry.envs || {};
  return envMap[envKey] || def || null;
}

export async function setRepoForProject(projectKey, repoKey) {
  const map = await getRepoRegistry();
  // Store expanded format for env-aware lookup; old format is still read safely.
  map[projectKey] = {
    default: repoKey,
    envs: { dev: repoKey, staging: repoKey, prod: repoKey },
  };
  await writeJsonObject(REPO_REGISTRY_FILE, map);
  return map;
}

export async function clearRepoForProject(projectKey) {
  const map = await getRepoRegistry();
  delete map[projectKey];
  await writeJsonObject(REPO_REGISTRY_FILE, map);
  return map;
}

export async function getDefaultRepoForProject(projectKey) {
  const map = await getRepoRegistry();
  return resolveRepoEntry(map[projectKey], null);
}

export async function getRepoForProjectEnv(projectKey, envKey) {
  const map = await getRepoRegistry();
  return resolveRepoEntry(map[projectKey], envKey);
}

