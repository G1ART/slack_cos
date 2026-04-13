/**
 * 페르소나 계약 3층 (에픽 4 확장 궤적 — COS_Layer_Epic_LockIn).
 * 실제 페르소나별 바인딩 전에, 레이어 이름만 SSOT로 고정해 두고 도구·스키마와 연결한다.
 *
 * - system_prompt: Founder `buildSystemInstructions` + `personaHarnessInstructions.js`
 * - tool_scope: COS_TOOLS / delegate — 향후 allowlist·역할 태그
 * - deliverable_schema: delegate 패킷·emit_patch envelope — 기계 검증 계약
 */

/** @type {readonly ['system_prompt', 'tool_scope', 'deliverable_schema']} */
export const COS_PERSONA_CONTRACT_LAYERS = Object.freeze([
  'system_prompt',
  'tool_scope',
  'deliverable_schema',
]);
