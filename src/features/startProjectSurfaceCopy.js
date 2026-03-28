/**
 * `start_project` 대표 표면 — 6절 정렬 요약만. Council· APR·내부 코맨드 코칭 없음.
 * @param {string} goalText 분류기가 뽑은 목표 본문
 * @param {{ toneAck?: string | null }} [options]
 * @returns {string}
 */
export function buildStartProjectAlignmentSummary(goalText, options = {}) {
  const toneAck = options.toneAck != null && String(options.toneAck).trim() ? String(options.toneAck).trim() : null;
  const g = String(goalText || '').trim();
  const cal = /캘린더|스케줄|달력|일정|예약|멤버|갤러리|아뜰|공간|대관|룸/u.test(g);

  /** @type {string[]} */
  const mvpBullets = cal
    ? [
        '웹 MVP·반응형 우선; 모바일은 기본 **조회 중심**으로 둡니다.',
        '캘린더 뷰는 **월+주**를 중심으로 합니다(일 뷰는 후순위).',
        '멤버는 **초대·역할(관리자/일반)** 기준으로 씁니다.',
      ]
    : [
        '웹 MVP·반응형 우선.',
        '첫 사용자층은 **내부** 기준.',
        '역할은 **관리자 + 일반** 2단계로 둡니다.',
      ];

  /** @type {string[]} */
  const includeExclude = cal
    ? [
        '*포함:* 공간·멤버 일정 **등록·조회**, 기본 알림(인앱 또는 이메일 중 하나는 후속 확정).',
        '*제외(v1):* 외부 SaaS 깊은 통합, 결제·복잡한 권한 모델, 네이티브 앱 필수 요구.',
      ]
    : [
        '*포함:* 핵심 사용자 시나리오 **한 갈래** end-to-end.',
        '*제외(v1):* 외부 SaaS·결제·SSO 등 **명시 전까지** 범위 밖.',
      ];

  /** @type {string[]} */
  const criticalQs = cal
    ? [
        '1. 중심 사용은 **공간 예약(대관/룸)** 이 메인인가요, **개인·팀 일정** 이 메인인가요?',
        '2. **반복 일정**이 v1에서 꼭 필요한가요?',
        '3. **승인이 필요한 일정**과 **즉시 등록** 가능한 일정은 어떻게 나눌까요?',
      ]
    : [
        '1. v1에서 *반드시* 되어야 하는 **단 한 가지 행동**은 무엇인가요?',
        '2. 주 사용 환경은 **웹만**인가요, 모바일에서 편집까지 필요한가요?',
        '3. 외부 툴·캘린더 **연동이 v1 필수**인가요?',
      ];

  /** @type {string[]} */
  const silentDefaults = cal
    ? [
        '- 중심 축이 불명확하면: **공간+개인 둘 다** 지원, 화면은 필터로 전환.',
        '- 반복 일정: **무응답 시 v1에서는 단일 일정만**(반복은 다음 단계).',
        '- 승인: **전시·대관·외부 대관** 정도만 관리자 승인, 나머지는 멤버가 즉시 등록.',
      ]
    : [
        '- 한 가지 행동: **무응답 시** 위 MVP 가정안대로 진행.',
        '- 모바일: **무응답 시** 웹 우선·모바일은 조회 위주.',
        '- 외부 연동: **무응답 시** v1 범위에서 제외.',
      ];

  /** @type {string[]} */
  const lines = [];

  if (toneAck) {
    lines.push(`_${toneAck}_`, '');
  }

  lines.push(
    '*[정렬 · 툴/프로젝트 킥오프]*',
    '',
    '*1. 내가 이해한 요청*',
    g
      ? `_${g.slice(0, 520)}${g.length > 520 ? '…' : ''}_`
      : '_목표를 한 줄로 적어 주세요._',
    '_다르면 한 줄만 정정해 주세요._',
    '',
    '*2. 기본 MVP 가정안*',
    ...mvpBullets.map((s) => `- ${s}`),
    '',
    '*3. 포함 / 제외 범위*',
    ...includeExclude,
    '',
    '*4. 결과를 크게 바꾸는 핵심 질문 (2~3)*',
    ...criticalQs,
    '',
    '*5. 무응답 시 적용할 기본값*',
    ...silentDefaults,
    '',
    '*6. 다음 산출물*',
    '좁힌 범위 기준 **실행 계획(PLN) 초안** → 필요 시 **결정 패킷** → **작업 시드(WRK)** 순으로 깔겠습니다.',
    '_이 정렬 턴에는 **승인 대기열(APR)을 만들지 않습니다.** 분기가 패킷으로 고정된 뒤에만 승인 게이트를 둡니다._',
  );

  return lines.join('\n');
}

/** @deprecated internal split 없이 `buildStartProjectAlignmentSummary` 사용 */
export function buildStartProjectSurfaceBodyLines(goalText) {
  return buildStartProjectAlignmentSummary(goalText).split('\n');
}
