#!/usr/bin/env node
/** vNext.13.3 — 모호·문서·연구 vs 실행 승인 분리 + proposal_execution_contract */
import assert from 'node:assert/strict';
import { buildProposalFromFounderInput } from '../src/founder/founderProposalKernel.js';
import { synthesizeFounderContext } from '../src/founder/founderContextSynthesizer.js';
import { buildSlackThreadKey } from '../src/features/slackConversationBuffer.js';
import { buildFounderApprovalPacket } from '../src/founder/founderApprovalPacket.js';

function C(ch, overrides = {}) {
  const m = { source_type: 'direct_message', channel: ch, user: 'U', ts: '1' };
  const base = synthesizeFounderContext({ threadKey: buildSlackThreadKey(m), metadata: m });
  return { ...base, ...overrides };
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

// 1 문서·IR — execution 오인 없음
noExt(buildProposalFromFounderInput({ rawText: 'IR 덱 내러티브만 리라이트해줘', contextFrame: C('Da1') }));

// 2 비교·조사 — approval packet 없음
noExt(
  buildProposalFromFounderInput({
    rawText: '경쟁사 5곳 벤치마크 비교표로 정리해줘',
    contextFrame: C('Da2'),
  }),
);

// 3 모호 시작 — scope lock 없음
noExt(buildProposalFromFounderInput({ rawText: '이제 시작하자', contextFrame: C('Da3') }));

// 4 등록·개시 모호
noExt(buildProposalFromFounderInput({ rawText: '등록하고 개시해', contextFrame: C('Da4') }));

// 5 짧은 진행만
noExt(buildProposalFromFounderInput({ rawText: '진행해', contextFrame: C('Da5') }));

// 6 승인 캐리 + 활성 런 — 외부 실행 태스크(승인 패킷 대상)
hasExt(
  buildProposalFromFounderInput({
    rawText: '좋아, 이 안으로 진행해',
    contextFrame: C('Da6', { has_run: true, goal_line_hint: 'MVP 핸드오프 확정' }),
  }),
);

// 7 mutation 어휘지만 스코프 신호 없음 — external 금지
noExt(buildProposalFromFounderInput({ rawText: '실제로 배포 적용해', contextFrame: C('Da7') }));

// 8 mutation + 시스템 명시 — external 허용
hasExt(
  buildProposalFromFounderInput({
    rawText: 'GitHub에 PR 올려서 supabase 마이그레이션 적용해줘',
    contextFrame: C('Da8'),
  }),
);

// 9 긴 문맥 — 스코프 신호
hasExt(
  buildProposalFromFounderInput({
    rawText:
      '이번 스프린트 범위는 대시보드 리팩터와 결제 웹훅 수정이고, 프로덕션 배포까지 포함해서 실제로 반영해 주세요. 리스크는 롤백 태그를 남기는 것으로 합의했습니다.',
    contextFrame: C('Da9'),
  }),
);

// 10 원페이저 문서만
noExt(buildProposalFromFounderInput({ rawText: '원페이저 초안 메모만 작성', contextFrame: C('Da10') }));

// 11 리서치 메모
noExt(
  buildProposalFromFounderInput({
    rawText: '시장 조사 리서치 메모 내부용으로만',
    contextFrame: C('Da11'),
  }),
);

// 12 예산 시나리오 — COS_ONLY
noExt(
  buildProposalFromFounderInput({
    rawText: '분기 예산 세 시나리오 공격 중립 보수',
    contextFrame: C('Da12'),
  }),
);

// 13 플랫폼 언급이 있어도 문서 우선 힌트
noExt(
  buildProposalFromFounderInput({
    rawText: 'Series A IR 덱 narrative만 다듬기',
    contextFrame: C('Da13'),
  }),
);

// 14 authorized 런 — EXECUTION_READY
const pAuth = buildProposalFromFounderInput({
  rawText: '프로덕션에 지금 바로 배포 적용',
  contextFrame: C('Da14', {
    has_run: true,
    goal_line_hint: 'release lock smoke',
    external_execution_authorization_state: 'authorized',
  }),
});
hasExt(pAuth);
assert.equal(pAuth.proposal_execution_contract, 'EXECUTION_READY');

// 15 짧은 mutation 단어 단독 — no scope
noExt(buildProposalFromFounderInput({ rawText: 'PR 올려', contextFrame: C('Da15') }));

// 16 커서 라이브 명시 + 짧음 — 시스템 키워드로 스코프
hasExt(buildProposalFromFounderInput({ rawText: '커서 라이브로 브랜치 푸시', contextFrame: C('Da16') }));

// 17 멀티 도메인 짧은 문장 — 질문 생성, external 없음 유지
const multi = buildProposalFromFounderInput({
  rawText: '덱이랑 예산 같이',
  contextFrame: C('Da17'),
});
assert.ok((multi.open_questions || []).length >= 1);
noExt(multi);

// 18 투자자 톤 + 플랫폼 — 질문 분기 (mutation 없으면 external 없음)
noExt(
  buildProposalFromFounderInput({
    rawText: '투자자 톤 나눠서 메시지 맞추고 GitHub도 언급만',
    contextFrame: C('Da18', { has_run: false }),
  }),
);

// 19 trace 존재
const p19 = buildProposalFromFounderInput({ rawText: '이제 시작하자', contextFrame: C('Da19') });
assert.ok(Array.isArray(p19.proposal_contract_trace?.reasons));

// 20 문서 작성 요청에 "진행"이 섞여도 research/internal 우선
noExt(
  buildProposalFromFounderInput({
    rawText: '벤치마크 진행해서 메모만 남겨줘',
    contextFrame: C('Da20'),
  }),
);

console.log('ok: vnext13_3_founder_ambiguous_intent');
