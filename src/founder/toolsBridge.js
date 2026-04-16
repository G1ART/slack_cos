/**
 * External tools compatibility facade (W1).
 * Runtime SSOT: `toolPlane/dispatchExternalToolCall.js`, `externalToolLaneRegistry.js`, `lanes/*`.
 */

export {
  dispatchExternalToolCall,
  invokeExternalTool,
} from './toolPlane/dispatchExternalToolCall.js';

export {
  getAdapterReadiness,
  getAllAdapterReadiness,
  formatAdapterReadinessOneLine,
  formatAdapterReadinessCompactLines,
} from './toolPlane/toolLaneReadiness.js';

export {
  ALL_EXTERNAL_TOOLS as TOOL_ENUM,
  TOOL_ALLOWED_ACTIONS,
  isValidToolAction,
} from './toolPlane/toolLaneActions.js';

export {
  EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
  DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
  DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
  TOOL_OUTCOME_CODES,
  __invokeToolTestHooks,
  ADAPTER_RUNTIME_CAPS,
} from './toolPlane/toolLaneContract.js';

export {
  resolveGithubToken,
  resolveGithubRepositoryString,
  resolveGithubTokenSource,
  resolveGithubRepositorySource,
  parseGithubRepoFromEnv,
} from './toolPlane/lanes/githubLane.js';

export { SUPABASE_APPLY_SQL_RPC } from './toolPlane/externalToolLaneRegistry.js';

export { toolInvocationBlocked } from './toolPlane/toolInvocationPrecheck.js';

export {
  isCursorCloudAgentLaneReady as isCursorCloudAgentConfigured,
  isCursorCloudAgentEnabled,
  isCursorAutomationConfigured,
} from './cursorCloudAdapter.js';

export { __cursorExecFileForTests } from './toolPlane/lanes/cursorLane.js';
