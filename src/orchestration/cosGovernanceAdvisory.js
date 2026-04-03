/**
 * vNext.13.2 — COS may suggest re-org, tooling, governance tightening in natural language.
 * This is not founder keyword routing: soft heuristic only to surface optional advisory appendix.
 */

import { describeConnectorAndSubscriptionAngle, describeReviewAndGuardianPattern } from './toolExpansionAdvisory.js';

/**
 * @param {{ rawText: string, contextFrame?: Record<string, unknown> }} args
 * @returns {{ text: string, topics: string[] } | null}
 */
export function maybeGovernanceAdvisoryForFounder({ rawText, contextFrame: _contextFrame }) {
  const t = String(rawText || '').trim();
  if (t.length < 12) return null;

  const asksSufficiency =
    /충분한가|충분할까|될까요|가능한가|한계|괜찮은지|어떻게\s*보이/i.test(t) ||
    /sufficient|enough|good\s*enough|limitations?/i.test(t);
  const outreachInvestor =
    /아웃리치|투자자별|맞춤|자동화|캠페인|메일|이메일|시퀀스/i.test(t) ||
    /outreach|investor|segment|automation|sequence/i.test(t);
  const orgOrStructure = /구조|조직|역할|분리|통합|re-?org|governance|팀/i.test(t);

  if (asksSufficiency && (outreachInvestor || orgOrStructure)) {
    const parts = [
      '_(COS 운영 조언 — 실행 승인과 별개로 참고만 해 주세요)_ ',
      '투자자 세그먼트별 맞춤 아웃리치까지 자동화하려면, ',
      '**Investor Research**와 **Outreach Writer**를 분리하고 발송·기록 감사를 **승인 게이트와 분리**해 두는 편이 보통 안전합니다. ',
      describeConnectorAndSubscriptionAngle(),
      ' ',
      describeReviewAndGuardianPattern(),
      ' 지금 구조로도 초안·내부 시뮬레이션은 COS_ONLY로 진행할 수 있고, 외부 발송·커넥터는 별도 승인 범위로 잡는 것을 권합니다.',
    ];
    return {
      text: parts.join(''),
      topics: ['re_org', 'tooling', 'governance_tightening', 'subscription_connector'],
    };
  }

  return null;
}
