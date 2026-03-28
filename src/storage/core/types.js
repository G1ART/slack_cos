import {
  APPROVALS_FILE,
  DECISIONS_FILE,
  LESSONS_FILE,
  INTERACTIONS_FILE,
  CHANNELS_FILE,
  PROJECT_CONTEXT_FILE,
  ENV_CONTEXT_FILE,
  REPO_REGISTRY_FILE,
  SUPABASE_REGISTRY_FILE,
  AUTOMATION_SETTINGS_FILE,
  WORK_ITEMS_FILE,
  WORK_RUNS_FILE,
  PLANS_FILE,
  resolvePlansPath,
  resolveWorkItemsPath,
} from '../paths.js';

/**
 * Collection mapping:
 * - kind=array: JSON file contains array
 * - kind=object_map: JSON file contains object map
 */
export const COLLECTION_DEFS = {
  approvals: {
    name: 'approvals',
    supabaseTable: 'g1cos_approvals',
    kind: 'array',
    filePath: APPROVALS_FILE,
    idField: 'id',
    createdAtField: 'created_at',
    updatedAtField: 'updated_at',
  },
  decisions: {
    name: 'decisions',
    supabaseTable: 'g1cos_decisions',
    kind: 'array',
    filePath: DECISIONS_FILE,
    idField: 'id',
    createdAtField: 'created_at',
    updatedAtField: null,
  },
  lessons: {
    name: 'lessons',
    supabaseTable: 'g1cos_lessons',
    kind: 'array',
    filePath: LESSONS_FILE,
    idField: 'id',
    createdAtField: 'created_at',
    updatedAtField: null,
  },
  interactions: {
    name: 'interactions',
    supabaseTable: 'g1cos_interactions',
    kind: 'array',
    filePath: INTERACTIONS_FILE,
    idField: 'id',
    createdAtField: 'created_at',
    updatedAtField: 'updated_at',
  },
  channel_context: {
    name: 'channel_context',
    supabaseTable: 'g1cos_channel_context',
    kind: 'object_map',
    filePath: CHANNELS_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: null,
  },
  project_context: {
    name: 'project_context',
    supabaseTable: 'g1cos_project_context',
    kind: 'object_map',
    filePath: PROJECT_CONTEXT_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: 'updated_at',
  },
  environment_context: {
    name: 'environment_context',
    supabaseTable: 'g1cos_environment_context',
    kind: 'object_map',
    filePath: ENV_CONTEXT_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: 'updated_at',
  },
  repo_registry: {
    name: 'repo_registry',
    supabaseTable: 'g1cos_repo_registry',
    kind: 'object_map',
    filePath: REPO_REGISTRY_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: null,
  },
  supabase_registry: {
    name: 'supabase_registry',
    supabaseTable: 'g1cos_supabase_registry',
    kind: 'object_map',
    filePath: SUPABASE_REGISTRY_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: null,
  },
  automation_settings: {
    name: 'automation_settings',
    supabaseTable: 'g1cos_automation_settings',
    kind: 'object_map',
    filePath: AUTOMATION_SETTINGS_FILE,
    idField: null,
    createdAtField: null,
    updatedAtField: null,
  },
  work_items: {
    name: 'work_items',
    supabaseTable: 'g1cos_work_items',
    kind: 'array',
    filePath: WORK_ITEMS_FILE,
    idField: 'id',
    createdAtField: 'created_at',
    updatedAtField: 'updated_at',
  },
  work_runs: {
    name: 'work_runs',
    supabaseTable: 'g1cos_work_runs',
    kind: 'array',
    filePath: WORK_RUNS_FILE,
    idField: 'run_id',
    createdAtField: 'created_at',
    updatedAtField: 'updated_at',
  },
  /** Phase 4: SSOT — g1cos_plans (dual-write + supabase read preference) */
  plans: {
    name: 'plans',
    supabaseTable: 'g1cos_plans',
    kind: 'array',
    filePath: PLANS_FILE,
    idField: 'plan_id',
    createdAtField: 'created_at',
    updatedAtField: 'updated_at',
  },
};

export const COLLECTION_NAMES = Object.keys(COLLECTION_DEFS);

export function getCollectionDef(name) {
  const d = COLLECTION_DEFS[name] || null;
  if (!d) return null;
  if (name === 'plans') return { ...d, filePath: resolvePlansPath() };
  if (name === 'work_items') return { ...d, filePath: resolveWorkItemsPath() };
  return d;
}

// STORAGE_MODE=dual 에서 Supabase 승격(읽기 우선 대상) + dual-write
export const CORE_DUAL_WRITE_COLLECTIONS = [
  'plans',
  'approvals',
  'work_items',
  'work_runs',
  'project_context',
  'environment_context',
];

