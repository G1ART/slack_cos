/**
 * vNext.13.2 — COS may suggest re-org, tooling, governance tightening in natural language.
 * vNext.13.3 — 기본 비활성(COS_GOVERNANCE_ADVISORY=1일 때만); 창업자 핵심 서피스에서는 부록 금지.
 */

import { describeConnectorAndSubscriptionAngle, describeReviewAndGuardianPattern } from './toolExpansionAdvisory.js';

/** 부록은 본문보다 길어지면 안 됨 — 상한(문자) */
export const GOVERNANCE_ADVISORY_MAX_CHARS = 420;

const FORBIDDEN_FOUNDER_SURFACES = new Set([
  'proposal_packet_surface',
  'approval_packet_surface',
  'launch_blocked_surface',
  'launch_gate_surface',
  'execution_packet_surface',
  'status_report_surface',
  'runtime_meta_surface',
  'orchestration_handoff_surface',
  'dialogue_surface',
  'safe_fallback_surface',
  'partner_natural_surface',
  'scope_lock_packet_surface',
]);

/**
 * @param {string} [founderSurface]
 */
/** 회귀 전용 — 프로덕션 창업자 서피스에서는 부록 비활성 */
export const GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE = 'governance_advisory_unit_test_allow';

export function isGovernanceAdvisorySurfaceForbidden(founderSurface) {
  const s = String(founderSurface || '').trim();
  if (!s) return true;
  if (s === GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE) return false;
  return FORBIDDEN_FOUNDER_SURFACES.has(s);
}

/**
 * @param {{ rawText: string, contextFrame?: Record<string, unknown>, founderSurface?: string }} args
 * @returns {{ text: string, topics: string[] } | null}
 */
export function maybeGovernanceAdvisoryForFounder({ rawText, contextFrame: _contextFrame, founderSurface }) {
  if (process.env.COS_GOVERNANCE_ADVISORY !== '1') {
    return null;
  }
  if (isGovernanceAdvisorySurfaceForbidden(founderSurface)) {
    return null;
  }

  const t = String(rawText || '').trim();
  if (t.length < 12) return null;

  const asksSufficiency =
    /충분한가|충분할까|될까요|가능한가|한계|괜찮은지|어떻게\s*보이/i.test(t) ||
    /sufficient|enough|good\s*enough|limitations?/i.test(t);
  const outreachInvestor =
    /아웃리치|투자자별|맞춤|자동화|캠페인|메일|이메일|시퀀스/i.test(t) ||
    /outreach|investor|segment|automation|sequence/i.test(t);
  const orgOrStructure =
    /구조|조직|역할|분리|통합|re-?org|governance|팀|프로세스|협업\s*모델|운영\s*설계/i.test(t);

  if (asksSufficiency && (outreachInvestor || orgOrStructure)) {
    const core = [
      '_(COS 운영 조언 — 실행 승인과 별개, 짧은 부록만)_ ',
      '투자자 세그먼트별 맞춤 아웃리치까지 자동화하려면 ',
      '**Investor Research**와 **Outreach Writer**를 분리하고 발송·기록 감사를 승인 게이트와 분리해 두는 편이 보통 안전합니다. ',
      describeConnectorAndSubscriptionAngle(),
      ' ',
      describeReviewAndGuardianPattern(),
      ' 외부 발송·커넥터는 별도 승인 범위로 잡는 것을 권합니다.',
    ].join('');

    const text =
      core.length > GOVERNANCE_ADVISORY_MAX_CHARS ? core.slice(0, GOVERNANCE_ADVISORY_MAX_CHARS - 1) + '…' : core;
    return {
      text,
      topics: ['re_org', 'tooling', 'governance_tightening', 'subscription_connector'],
    };
  }

  return null;
}
