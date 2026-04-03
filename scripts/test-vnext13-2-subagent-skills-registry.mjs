#!/usr/bin/env node
import assert from 'node:assert/strict';
import { HARNESS_SKILLS_REGISTRY, HARNESS_SKILL_IDS } from '../src/orchestration/harnessSkillsRegistry.js';

const want = [
  'investor_thesis_fit_skill',
  'budget_scenario_skill',
  'teardown_matrix_skill',
  'launch_readiness_skill',
  'reconciliation_audit_skill',
  'deck_storyline_skill',
];
for (const id of want) {
  assert.ok(HARNESS_SKILLS_REGISTRY[id], id);
  const s = HARNESS_SKILLS_REGISTRY[id];
  assert.ok(s.summary?.length > 5);
  assert.ok(Array.isArray(s.jit_context_refs) && s.jit_context_refs.length);
  assert.ok(Array.isArray(s.typical_agents) && s.typical_agents.length);
}
assert.equal(HARNESS_SKILL_IDS.length, want.length);

console.log('ok: vnext13_2_subagent_skills_registry');
