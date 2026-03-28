export function buildChannelHint(channelContext) {
  if (!channelContext) return '채널 기본 힌트 없음';

  const map = {
    general_cos: '이 채널은 일반 비서실장 채널이다. 전체 조정과 실행 요약을 기본값으로 삼아라.',
    strategy_finance: '이 채널은 전략 및 재무 채널이다. 우선순위, 예산, 집중도, 기대값 관점을 기본값으로 삼아라.',
    ops_grants: '이 채널은 운영 및 정부과제 채널이다. 자격, 증빙, 제출 현실성, 운영 부담 관점을 기본값으로 삼아라.',
    product_ux: '이 채널은 제품 및 사용자경험 채널이다. 사용자 문제, 기능 우선순위, 최소 실행 범위를 기본값으로 삼아라.',
    engineering: '이 채널은 엔지니어링 채널이다. 구현 가능성, 영향 범위, 공수, 안정성을 기본값으로 삼아라.',
    risk_review: '이 채널은 리스크 리뷰 채널이다. 가장 강한 반대 논리와 숨은 리스크를 더 강하게 드러내라.',
  };

  return map[channelContext] || '채널 기본 힌트 없음';
}
