export function evaluateMatrixCellTrigger({
  userText,
  route,
  channelContext,
  approvalNeeded = false,
  strongestObjection = '',
}) {
  const t = String(userText || '').toLowerCase();
  const reasons = [];

  const functionBuckets = [
    /(전략|예산|수익|투자|가격|우선순위)/,
    /(운영|인사|정부|과제|제출|파트너|대외|커뮤니케이션)/,
    /(제품|ux|온보딩|경험|기능|전환)/,
    /(구현|엔지니어링|코드|성능|아키텍처|배포|데이터)/,
    /(리스크|컴플라이언스|법무|보안|반대)/,
  ];
  const matchedFunctions = functionBuckets.filter((re) => re.test(t)).length;
  if (matchedFunctions >= 3) reasons.push('세 개 이상 기능 얽힘');

  const hasMoney = /(돈|비용|예산|수익|가격|투자|roi)/.test(t);
  const hasBrand = /(브랜드|평판|신뢰|이미지|대외)/.test(t);
  const hasSchedule = /(일정|마감|데드라인|속도|긴급)/.test(t);
  if (hasMoney && hasBrand && hasSchedule) reasons.push('돈+브랜드+일정 동시 중요');

  if (/(외부 제출|대외 발신|파트너 커뮤니케이션|보도|제안서|신청서|공고)/.test(t)) {
    reasons.push('외부 제출/대외 커뮤니케이션 안건');
  }

  const strongObjText = String(strongestObjection || '').toLowerCase();
  const strongObjectionDetected =
    /(치명|중대|법적|컴플라이언스|회복 불가|돌이킬 수|브랜드 훼손|실패 가능성 높음)/.test(
      strongObjText
    );
  if (approvalNeeded && strongObjectionDetected) {
    reasons.push('approval 필요 + 강한 반대 논리');
  }

  const highSensitivity = channelContext === 'risk_review' || channelContext === 'strategy_finance';
  if (route?.urgency === 'high' && highSensitivity) {
    reasons.push('high urgency + high sensitivity');
  }

  return {
    shouldUseMatrixCell: reasons.length > 0,
    reasons,
  };
}
