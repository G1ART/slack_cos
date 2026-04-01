export const FounderHardFailReason = Object.freeze({
  INVARIANT_BREACH: 'invariant_breach',
  UNSUPPORTED_FOUNDER_INTENT: 'unsupported_founder_intent',
  RUNTIME_SYSTEM_FAILURE: 'runtime_system_failure',
});

const HARD_FAIL_MESSAGES = Object.freeze({
  [FounderHardFailReason.INVARIANT_BREACH]:
    '[COS] founder 응답 계약(invariant) 위반으로 안전 차단했습니다. 같은 요청을 한 줄로 다시 보내 주세요.',
  [FounderHardFailReason.UNSUPPORTED_FOUNDER_INTENT]:
    '[COS] 현재 founder 경로에서 지원하지 않는 의도입니다. 대표 의도(킥오프/정렬/상태/승인/배포/메타)로 다시 보내 주세요.',
  [FounderHardFailReason.RUNTIME_SYSTEM_FAILURE]:
    '[COS] 런타임 오류로 이번 턴을 처리하지 못했습니다. 같은 요청을 다시 보내 주세요.',
});

export function buildFounderHardFail(reason, extras = {}) {
  const normalized =
    Object.values(FounderHardFailReason).includes(reason)
      ? reason
      : FounderHardFailReason.RUNTIME_SYSTEM_FAILURE;
  return {
    reason: normalized,
    text: HARD_FAIL_MESSAGES[normalized],
    ...extras,
  };
}
