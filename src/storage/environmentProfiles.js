import { ENV_PROFILES_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';

const DEFAULT_ENV_KEYS = ['dev', 'staging', 'prod'];

function getDefaultProfiles() {
  return {
    dev: {
      env_key: 'dev',
      display_name: 'Dev',
      runtime_mode: 'local',
      default_repo_by_project: {
        abstract: 'g1art-abstract',
        slack_cos: 'g1-cos-slack',
        shared_tools: 'shared-tools',
        g1_ops: 'g1-ops',
      },
      default_db_by_project: {
        abstract: 'abstract-dev',
        slack_cos: 'slack-cos-dev',
        shared_tools: 'shared-tools-dev',
        g1_ops: 'g1-ops-dev',
      },
      branch_prefix_rules: {
        bug: 'fix',
        feature: 'feat',
        refactor: 'refactor',
        ops: 'chore',
        data: 'data',
        research: 'research',
        content: 'content',
      },
      risk_level: 'low',
      change_policy: '소규모/역추적 가능한 변경 우선',
      notes: '기본 개발 환경 프로필',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    staging: {
      env_key: 'staging',
      display_name: 'Staging',
      runtime_mode: 'hosted',
      default_repo_by_project: {
        abstract: 'g1art-abstract',
        slack_cos: 'g1-cos-slack',
        shared_tools: 'shared-tools',
        g1_ops: 'g1-ops',
      },
      default_db_by_project: {
        abstract: 'abstract-staging',
        slack_cos: 'slack-cos-staging',
        shared_tools: 'shared-tools-staging',
        g1_ops: 'g1-ops-staging',
      },
      branch_prefix_rules: {
        bug: 'fix',
        feature: 'feat',
        refactor: 'refactor',
        ops: 'chore',
        data: 'data',
        research: 'research',
        content: 'content',
      },
      risk_level: 'medium',
      change_policy: '검증(테스트/리뷰) 강화 후 반영',
      notes: '배포 전 통제 환경 프로필',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    prod: {
      env_key: 'prod',
      display_name: 'Prod',
      runtime_mode: 'hosted',
      default_repo_by_project: {
        abstract: 'g1art-abstract',
        slack_cos: 'g1-cos-slack',
        shared_tools: 'shared-tools',
        g1_ops: 'g1-ops',
      },
      default_db_by_project: {
        abstract: 'abstract-prod',
        slack_cos: 'slack-cos-prod',
        shared_tools: 'shared-tools-prod',
        g1_ops: 'g1-ops-prod',
      },
      branch_prefix_rules: {
        bug: 'fix',
        feature: 'feat',
        refactor: 'refactor',
        ops: 'chore',
        data: 'data',
        research: 'research',
        content: 'content',
      },
      risk_level: 'high',
      change_policy: '승인 게이트 + 리스크 최소화 필수',
      notes: '운영 환경 프로필',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

export async function getEnvironmentProfiles() {
  const raw = await readJsonObject(ENV_PROFILES_FILE, {});
  if (!raw || typeof raw !== 'object') {
    const defaults = getDefaultProfiles();
    await writeJsonObject(ENV_PROFILES_FILE, defaults);
    return defaults;
  }

  const defaults = getDefaultProfiles();
  let changed = false;
  for (const key of DEFAULT_ENV_KEYS) {
    if (!raw[key]) {
      raw[key] = defaults[key];
      changed = true;
    }
  }
  if (changed) {
    await writeJsonObject(ENV_PROFILES_FILE, raw);
  }
  return raw;
}

export async function getEnvironmentProfile(envKey) {
  const profiles = await getEnvironmentProfiles();
  return profiles[envKey] || profiles.dev;
}

export function getDefaultEnvKey() {
  return 'dev';
}

