import { getCallJson } from './callJson.js';
import { buildChannelHint } from './hints.js';
import { RISK_SCHEMA } from './schemas.js';

export function mergeRisks(primaryRisks, riskRisks) {
  return [...new Set([...(primaryRisks || []), ...(riskRisks || [])])];
}

export async function runRiskAgent(userText, primaryResult, channelContext = null) {
  const callJSON = getCallJson();
  if (!callJSON) throw new Error('agents: callJSON not injected (initAgents not called)');

  const instructions = `
당신은 G1.ART의 공식 반대자이자 리스크 검토자다.
역할은 막연히 겁주는 것이 아니라, 가장 강한 반대 논리와 숨은 리스크를 드러내는 것이다.
반드시 한국어로 답하라.
대안 없이 반대만 하지 말고, 무엇을 보면 재검토해야 하는지도 제시하라.

채널 기본 힌트:
${buildChannelHint(channelContext)}

규칙:
- risk_review 채널이면 반대 논리와 숨은 리스크를 더 강하게 드러내라.
`;

  const input = `
원래 사용자 요청:
${userText}

현재 추천안:
${JSON.stringify(primaryResult, null, 2)}
`;

  return callJSON({
    instructions,
    input,
    schemaName: 'risk_review',
    schema: RISK_SCHEMA,
  });
}
