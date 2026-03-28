import { getCallJson } from './callJson.js';
import { buildChannelHint } from './hints.js';
import { ROUTER_SCHEMA } from './schemas.js';

export async function routeTask(userText, channelContext = null) {
  const callJSON = getCallJson();
  if (!callJSON) throw new Error('agents: callJSON not injected (initAgents not called)');

  const instructions = `
당신은 G1.ART 비서실장의 라우터다.
사용자 요청을 아래 중 하나로 분류하라.

분류 기준:
- strategy_finance: 전략, 예산, 우선순위, 가격, 수익화, 투자대비효과
- ops_grants: 운영, 인사, 정부지원사업, 외부 제출, 절차 관리
- product_ux: 제품 방향, 기능 우선순위, 사용자경험, 온보딩, 흐름
- engineering: 구현, 오류, 성능, 배포, 데이터 구조, 기술 이슈
- summary: 요약, 정리, 회의 정리, 초안 정리
- general: 그 외 비서실장 일반 판단

include_risk 기준:
- 전략, 돈, 대외발신, 정부과제, 제품방향, 기술리스크, 되돌리기 어려운 결정이면 true
- 단순 요약/정리면 false 가능

urgency 기준:
- high: 즉시 판단/대응 필요
- medium: 이번 흐름 안에서 처리
- low: 급하지 않음

채널 기본 힌트:
${buildChannelHint(channelContext)}

규칙:
- 채널 기본 힌트를 참고하되, 사용자 요청 내용이 더 강하면 요청 내용을 우선한다.
- risk_review 채널이면 include_risk를 가능하면 true로 잡아라.
`;

  return callJSON({
    instructions,
    input: userText,
    schemaName: 'router_decision',
    schema: ROUTER_SCHEMA,
  });
}
