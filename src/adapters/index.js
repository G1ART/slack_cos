import * as cursorAdapter from './cursorAdapter.js';
import * as supabaseAdapter from './supabaseAdapter.js';
import * as githubAdapter from './githubAdapter.js';
import * as docsAdapter from './docsAdapter.js';
import * as manualAdapter from './manualAdapter.js';

const ADAPTERS = {
  cursor: cursorAdapter,
  supabase: supabaseAdapter,
  github: githubAdapter,
  docs: docsAdapter,
  manual: manualAdapter,
};

export function getAdapterByTool(toolKey) {
  return ADAPTERS[toolKey] || manualAdapter;
}

export function createAdapterRunPayload(workItem, metadata = {}) {
  const adapter = getAdapterByTool(workItem.assigned_tool || workItem.tool_key || 'manual');
  const base = adapter.createRun(workItem, metadata);
  return { adapter, runSeed: base };
}

export function formatDispatchForSlack(toolKey, run) {
  const adapter = getAdapterByTool(toolKey);
  return adapter.formatDispatchForSlack(run);
}

export function formatResultForSlack(toolKey, run) {
  const adapter = getAdapterByTool(toolKey);
  return adapter.formatResultForSlack(run);
}

export function parseResultIntakeByTool(toolKey, text) {
  const adapter = getAdapterByTool(toolKey);
  if (typeof adapter.parseResultIntake === 'function') {
    return adapter.parseResultIntake(text);
  }
  return null;
}

export function formatReviewForSlack(toolKey, run) {
  const adapter = getAdapterByTool(toolKey);
  if (typeof adapter.formatReviewForSlack === 'function') {
    return adapter.formatReviewForSlack(run);
  }
  return adapter.formatResultForSlack(run);
}
