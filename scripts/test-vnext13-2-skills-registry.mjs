#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  HARNESS_SKILLS_REGISTRY,
  HARNESS_SKILL_IDS,
  TEARDOWN_MATRIX_SKILL_ID,
} from '../src/orchestration/harnessSkillsRegistry.js';
import { HARNESS_SKILL_AGENT_BINDINGS } from '../src/orchestration/harnessSkillBindings.js';

const want = [
  'investor_thesis_fit_skill',
  'budget_scenario_skill',
  'competitor_matrix_skill',
  'launch_readiness_skill',
  'reconciliation_audit_skill',
  'deck_storyline_skill',
  'messaging_variation_skill',
  'research_synthesis_skill',
];

for (const id of want) {
  assert.ok(HARNESS_SKILLS_REGISTRY[id], id);
  const s = HARNESS_SKILLS_REGISTRY[id];
  assert.ok(s.summary.length > 5);
  assert.ok(s.jit_context_refs.length > 0);
  assert.ok(s.typical_agents.length > 0);
}
assert.equal(HARNESS_SKILL_IDS.length, want.length);
assert.equal(TEARDOWN_MATRIX_SKILL_ID, 'competitor_matrix_skill');

for (const id of want) {
  assert.ok(HARNESS_SKILL_AGENT_BINDINGS[id], `binding ${id}`);
}

console.log('ok: vnext13_2_skills_registry');
