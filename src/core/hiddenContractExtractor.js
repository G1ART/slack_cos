/**
 * Founder dialogue hidden contract extractor.
 * Converts free-form founder input into deterministic contract hints for writer.
 */

const CALENDAR_RE = /캘린더|스케줄|일정|예약/u;
const CRM_RE = /crm|리드|세일즈/i;

/**
 * @param {string} text
 * @returns {{
 *   domain: 'calendar' | 'crm' | 'generic',
 *   domain_hint: string,
 *   benchmark_axes: string[],
 *   mvp_scope_in: string[],
 *   mvp_scope_out: string[],
 *   risk_points: string[],
 *   key_questions: string[],
 * }}
 */
export function extractHiddenContract(text) {
  const t = String(text || '').trim();
  if (CALENDAR_RE.test(t)) {
    return {
      domain: 'calendar',
      domain_hint: '공간 리소스 예약 + 멤버 권한 + 외부 링크 공유',
      benchmark_axes: ['Google Calendar', 'Teamup', 'Calendly', 'Acuity', 'Notion Calendar'],
      mvp_scope_in: [
        '권한 기반 일정 등록/수정',
        '공간/수업/행사 리소스 충돌 방지',
        '외부 손님용 제한 링크',
        '알림/승인 변경 로그',
      ],
      mvp_scope_out: ['결제/정산 자동화', '고급 분석 대시보드', '다중 외부 연동 동시 구현'],
      risk_points: ['운영 책임자 부재로 규칙 붕괴', '권한 모델 과복잡으로 도입 지연', '모바일 입력 UX 미흡으로 사용률 저하'],
      key_questions: [
        '외부 사용자는 조회만 허용할지, 예약 요청까지 허용할지',
        '운영 UI를 단일로 통합할지, 유형별로 분리할지',
        '1차 연동 대상으로 Google Calendar를 즉시 포함할지',
      ],
    };
  }

  if (CRM_RE.test(t)) {
    return {
      domain: 'crm',
      domain_hint: '리드 수집 + 파이프라인 운영 + 후속 액션 관리',
      benchmark_axes: ['HubSpot', 'Pipedrive', 'Salesforce Essentials', 'Close', 'Notion CRM'],
      mvp_scope_in: ['핵심 워크플로우 1개 자동화', '역할/권한 정책', '운영 로그/추적', '핵심 알림'],
      mvp_scope_out: ['결제/정산 자동화', '고급 분석 대시보드', '다중 외부 연동 동시 구현'],
      risk_points: ['운영 책임자 부재로 규칙 붕괴', '권한 모델 과복잡으로 도입 지연', '모바일 입력 UX 미흡으로 사용률 저하'],
      key_questions: [
        '리드 입력 기준을 단일화할지, 유입 채널별로 분리할지',
        '영업 단계 정의를 우선 잠글지, 파이프라인 실험을 먼저 할지',
        '알림 채널을 Slack 단일로 시작할지, 이메일까지 포함할지',
      ],
    };
  }

  return {
    domain: 'generic',
    domain_hint: '운영 워크플로우 + 권한 + 실행 추적',
    benchmark_axes: ['Notion', 'Airtable', 'Slack Workflow', 'Zapier', 'Retool'],
    mvp_scope_in: ['핵심 워크플로우 1개 자동화', '역할/권한 정책', '운영 로그/추적', '핵심 알림'],
    mvp_scope_out: ['결제/정산 자동화', '고급 분석 대시보드', '다중 외부 연동 동시 구현'],
    risk_points: ['운영 책임자 부재로 규칙 붕괴', '권한 모델 과복잡으로 도입 지연', '모바일 입력 UX 미흡으로 사용률 저하'],
    key_questions: [
      '우선 자동화할 핵심 워크플로우를 하나로 잠글지',
      '승인권한을 단일 책임자로 둘지, 역할별 분산할지',
      '외부 연동은 1차 릴리스에서 제외할지',
    ],
  };
}
