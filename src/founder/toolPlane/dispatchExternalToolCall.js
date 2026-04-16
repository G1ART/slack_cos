/**
 * Runtime external tool dispatch (W1 SSOT). Thin entry; implementation lives in
 * {@link runExternalToolInvocationFlow} (`externalToolInvocationFlow.js`).
 */

import { runExternalToolInvocationFlow } from './externalToolInvocationFlow.js';

export async function dispatchExternalToolCall(spec, ctx = {}) {
  return runExternalToolInvocationFlow(spec, ctx);
}

export { dispatchExternalToolCall as invokeExternalTool };
