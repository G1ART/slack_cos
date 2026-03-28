import { AUTOMATION_SETTINGS_FILE } from '../storage/paths.js';
import { readJsonObject, writeJsonObject } from '../storage/jsonStore.js';
import { JOB_NAMES, JOB_REGISTRY } from './jobs.js';

const DEFAULT_SETTINGS = {
  enabled_jobs: [],
  default_channel_by_job: {},
  default_user_by_job: {},
  schedule_stub: {},
  last_run_at_by_job: {},
};

export async function getAutomationSettings() {
  const settings = await readJsonObject(AUTOMATION_SETTINGS_FILE, DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    enabled_jobs: Array.isArray(settings.enabled_jobs)
      ? settings.enabled_jobs.filter((j) => JOB_NAMES.includes(j))
      : [],
  };
}

export async function setAutomationJobEnabled(jobName, enabled) {
  if (!JOB_NAMES.includes(jobName)) return { ok: false, reason: 'invalid_job' };
  const settings = await getAutomationSettings();
  const next = { ...settings };
  const set = new Set(next.enabled_jobs);
  if (enabled) set.add(jobName);
  else set.delete(jobName);
  next.enabled_jobs = [...set];
  await writeJsonObject(AUTOMATION_SETTINGS_FILE, next);
  return { ok: true, settings: next };
}

export async function recordAutomationRun(jobName, timestamp) {
  const settings = await getAutomationSettings();
  settings.last_run_at_by_job = settings.last_run_at_by_job || {};
  settings.last_run_at_by_job[jobName] = timestamp;
  await writeJsonObject(AUTOMATION_SETTINGS_FILE, settings);
}

export function formatAutomationSettings(settings) {
  return [
    '자동화설정',
    `- enabled_jobs: ${settings.enabled_jobs.length ? settings.enabled_jobs.join(', ') : '없음'}`,
    `- schedule_stub keys: ${Object.keys(settings.schedule_stub || {}).length}`,
    `- default_channel_by_job keys: ${Object.keys(settings.default_channel_by_job || {}).length}`,
    `- default_user_by_job keys: ${Object.keys(settings.default_user_by_job || {}).length}`,
    `- last_run_at_by_job keys: ${Object.keys(settings.last_run_at_by_job || {}).length}`,
  ].join('\n');
}

export async function runAutomationJob(jobName, context = {}) {
  if (!JOB_NAMES.includes(jobName)) return { ok: false, reason: 'invalid_job' };
  const job = JOB_REGISTRY[jobName];
  const result = await job.runJob(context);
  const text = job.formatJobOutput(result);
  await recordAutomationRun(jobName, new Date().toISOString());
  return { ok: true, jobName, result, text };
}

export { JOB_NAMES };
