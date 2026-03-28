import { setCallJson } from './callJson.js';
import { routeTask } from './router.js';
import { runPrimaryAgent } from './primary.js';
import { runRiskAgent, mergeRisks } from './risk.js';
import { runCouncilMode, parseCouncilCommand } from './council.js';
import {
  composeFinalReport,
  deriveDecisionState,
  bulletList,
} from './reportComposer.js';

export function initAgents({ callJSON }) {
  setCallJson(callJSON);
}

export { routeTask } from './router.js';
export { runPrimaryAgent } from './primary.js';
export { runRiskAgent, mergeRisks } from './risk.js';
export { runCouncilMode, parseCouncilCommand } from './council.js';
export {
  composeFinalReport,
  deriveDecisionState,
  bulletList,
} from './reportComposer.js';
