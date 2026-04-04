#!/usr/bin/env node
/** vNext.13.3 + 13.4 — 모호·문서·연구 vs 실행 승인: sidecar·패킷에서만 도출 (원문 regex 분류 없음) */
import assert from 'node:assert/strict';
import { buildProposalPacketFromSidecar } from '../src/founder/founderProposalKernel.js';
import { emptySidecarFromPartner } from '../src/founder/founderArtifactSchemas.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { buildFounderApprovalPacket } from '../src/founder/founderApprovalPacket.js';

function C(ch, overrides = {}) {
  const m = { source_type: 'direct_message', channel: ch, user: 'U', ts: '1' };
  const base = synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m });
  return { ...base, ...overrides };
}

function sidecar(pa, aa = {}, extra = {}) {
  return {
    ...emptySidecarFromPartner(''),
    conversation_status: 'narrowing',
    proposal_artifact: pa,
    approval_artifact: aa,
    ...extra,
  };
}

function noExt(p) {
  assert.equal((p.external_execution_tasks || []).length, 0, String(p.understood_request).slice(0, 40));
  assert.equal(p.proposal_execution_contract, 'COS_ONLY');
  assert.ok((buildFounderApprovalPacket(p).visible_section || '').length === 0);
}

function hasExt(p) {
  assert.ok((p.external_execution_tasks || []).length > 0);
  assert.ok(['APPROVAL_REQUIRED', 'EXECUTION_READY'].includes(p.proposal_execution_contract));
  assert.ok((buildFounderApprovalPacket(p).visible_section || '').length > 0);
}

function P(ch, raw, pa, aa = {}, extra = {}, ctxOverrides = {}) {
  return buildProposalPacketFromSidecar(sidecar(pa, aa, extra), C(ch, ctxOverrides), raw, { source: 'test' });
}

// 1 문서·IR — execution 오인 없음
noExt(
  P('Da1', 'IR 덱 내러티브만 리라이트해줘', {
    understood_request: 'IR 덱 내러티브 리라이트',
    cos_only_tasks: ['내러티브 초안'],
  }),
);

// 2 비교·조사 — approval packet 없음
noExt(
  P('Da2', '경쟁사 5곳 벤치마크 비교표로 정리해줘', {
    understood_request: '경쟁사 벤치마크',
    internal_support_tasks: ['비교표'],
  }),
);

// 3 모호 시작 — scope lock 없음
noExt(P('Da3', '이제 시작하자', { understood_request: '시작', cos_only_tasks: ['의미 정렬'] }));

// 4 등록·개시 모호
noExt(P('Da4', '등록하고 개시해', { understood_request: '등록·개시', cos_only_tasks: ['범위 확인'] }));

// 5 짧은 진행만
noExt(P('Da5', '진행해', { understood_request: '진행', cos_only_tasks: ['다음 액션 정리'] }));

// 6 승인 캐리 + 활성 런 — 외부 실행 태스크(승인 패킷 대상)
hasExt(
  P(
    'Da6',
    '좋아, 이 안으로 진행해',
    {},
    {
      requires_external_dispatch: true,
      external_tasks: ['합의안대로 외부 실행'],
      rationale: '활성 런 맥락',
    },
    {},
    { has_run: true, goal_line_hint: 'MVP 핸드오프 확정' },
  ),
);

// 7 mutation 어휘지만 스코프 신호 없음 — external 금지
noExt(P('Da7', '실제로 배포 적용해', { understood_request: '배포', cos_only_tasks: ['스코프 확인'] }));

// 8 mutation + 시스템 명시 — external 허용
hasExt(
  P(
    'Da8',
    'GitHub에 PR 올려서 supabase 마이그레이션 적용해줘',
    {},
    {
      requires_external_dispatch: true,
      external_tasks: ['GitHub PR + Supabase 마이그레이션'],
      rationale: '시스템 명시',
    },
  ),
);

// 9 긴 문맥 — 스코프 신호
hasExt(
  P(
    'Da9',
    '이번 스프린트 범위는 대시보드 리팩터와 결제 웹훅 수정이고, 프로덕션 배포까지 포함해서 실제로 반영해 주세요. 리스크는 롤백 태그를 남기는 것으로 합의했습니다.',
    {},
    {
      requires_external_dispatch: true,
      external_tasks: ['대시보드·웹훅·프로덕션 배포'],
      rationale: '스프린트 합의',
    },
  ),
);

// 10 원페이저 문서만
noExt(P('Da10', '원페이저 초안 메모만 작성', { understood_request: '원페이저', cos_only_tasks: ['메모'] }));

// 11 리서치 메모
noExt(
  P('Da11', '시장 조사 리서치 메모 내부용으로만', {
    understood_request: '리서치 메모',
    internal_support_tasks: ['내부 메모'],
  }),
);

// 12 예산 시나리오 — COS_ONLY
noExt(
  P('Da12', '분기 예산 세 시나리오 공격 중립 보수', {
    understood_request: '예산 시나리오',
    cos_only_tasks: ['시나리오 정리'],
  }),
);

// 13 플랫폼 언급이 있어도 문서 우선 힌트
noExt(
  P('Da13', 'Series A IR 덱 narrative만 다듬기', {
    understood_request: 'IR 덱 narrative',
    cos_only_tasks: ['내러티브 다듬기'],
  }),
);

// 14 authorized 런 — EXECUTION_READY
const pAuth = P(
  'Da14',
  '프로덕션에 지금 바로 배포 적용',
  {},
  {
    requires_external_dispatch: true,
    external_tasks: ['프로덕션 배포'],
    rationale: '승인됨',
  },
  {},
  { has_run: true, goal_line_hint: 'release lock smoke', external_execution_authorization_state: 'authorized' },
);
hasExt(pAuth);
assert.equal(pAuth.proposal_execution_contract, 'EXECUTION_READY');

// 15 짧은 mutation 단어 단독 — no scope
noExt(P('Da15', 'PR 올려', { understood_request: 'PR', cos_only_tasks: ['맥락 확인'] }));

// 16 커서 라이브 명시 + 짧음 — 시스템 키워드로 스코프
hasExt(
  P(
    'Da16',
    '커서 라이브로 브랜치 푸시',
    {},
    {
      requires_external_dispatch: true,
      external_tasks: ['Cursor 라이브 브랜치 푸시'],
      rationale: '명시된 실행 경로',
    },
  ),
);

// 17 멀티 도메인 짧은 문장 — 질문 생성, external 없음 유지
const multi = P(
  'Da17',
  '덱이랑 예산 같이',
  { understood_request: '덱·예산' },
  {},
  { follow_up_questions: ['덱과 예산 중 이번 턴 우선은 무엇인가요?'] },
);
assert.ok((multi.open_questions || []).length >= 1);
noExt(multi);

// 18 투자자 톤 + 플랫폼 — 질문 분기 (mutation 없으면 external 없음)
noExt(
  P(
    'Da18',
    '투자자 톤 나눠서 메시지 맞추고 GitHub도 언급만',
    {
      understood_request: '투자자 톤·메시지',
      cos_only_tasks: ['메시지 초안'],
      open_questions: ['GitHub는 문서만인가 실행까지 필요한가요?'],
    },
    {},
    {},
    { has_run: false },
  ),
);

// 19 trace 존재
const p19 = P('Da19', '이제 시작하자', { understood_request: '시작' });
assert.ok(Array.isArray(p19.proposal_contract_trace?.reasons));

// 20 문서 작성 요청에 "진행"이 섞여도 research/internal 우선
noExt(
  P('Da20', '벤치마크 진행해서 메모만 남겨줘', {
    understood_request: '벤치마크 메모',
    internal_support_tasks: ['벤치마크 메모'],
  }),
);

console.log('ok: vnext13_3_founder_ambiguous_intent');
