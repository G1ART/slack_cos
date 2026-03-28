import { SUPABASE_REGISTRY_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';

const DEFAULTS = {};

export async function getSupabaseRegistry() {
  return readJsonObject(SUPABASE_REGISTRY_FILE, DEFAULTS);
}

function resolveDbEntry(entry, envKey) {
  // Backward compatible: string means default.
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  const def = entry.default || null;
  if (!envKey) return def;
  const envMap = entry.envs || {};
  return envMap[envKey] || def || null;
}

export async function setDbForProject(projectKey, db_key) {
  const map = await getSupabaseRegistry();
  map[projectKey] = {
    default: db_key,
    envs: { dev: db_key, staging: db_key, prod: db_key },
  };
  await writeJsonObject(SUPABASE_REGISTRY_FILE, map);
  return map;
}

export async function clearDbForProject(projectKey) {
  const map = await getSupabaseRegistry();
  delete map[projectKey];
  await writeJsonObject(SUPABASE_REGISTRY_FILE, map);
  return map;
}

export async function getDefaultDbForProject(projectKey) {
  const map = await getSupabaseRegistry();
  return resolveDbEntry(map[projectKey], null);
}

export async function getDbForProjectEnv(projectKey, envKey) {
  const map = await getSupabaseRegistry();
  return resolveDbEntry(map[projectKey], envKey);
}

