import { readJsonArray } from '../storage/jsonStore.js';
import { APPROVALS_FILE } from '../storage/paths.js';
import { formatPendingApprovalsSummary } from '../features/approvals.js';
import { listWorkItems } from '../features/workItems.js';
import { listWorkRuns } from '../features/workRuns.js';

export async function buildApprovalDigestPayload() {
  const approvals = await readJsonArray(APPROVALS_FILE);
  const pending = approvals
    .filter((a) => a.status === 'pending')
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    .slice(0, 10);
  return { pending };
}

export async function runApprovalDigestJob() {
  const p = await buildApprovalDigestPayload();
  return {
    job_name: 'approval_digest',
    generated_at: new Date().toISOString(),
    pending: p.pending,
  };
}

export function formatApprovalDigestOutput(result) {
  if (!result.pending.length) {
    return `승인대기요약\n- 생성시각: ${result.generated_at}\n- 승인 대기 안건이 없습니다.`;
  }
  const summary = formatPendingApprovalsSummary(result.pending);
  const text = typeof summary === 'string' ? summary : summary.text;
  return [`승인대기요약`, `- 생성시각: ${result.generated_at}`, '', text].join('\n');
}

export async function buildBlockedWorkDigestPayload() {
  const [works, runs] = await Promise.all([
    listWorkItems({ count: 200, openOnly: false }),
    listWorkRuns({ count: 200 }),
  ]);
  return {
    blockedWorks: works.filter((w) => w.status === 'blocked').slice(0, 20),
    blockedRuns: runs.filter((r) => r.status === 'blocked').slice(0, 20),
  };
}

export async function runBlockedWorkDigestJob() {
  const p = await buildBlockedWorkDigestPayload();
  return {
    job_name: 'blocked_work_digest',
    generated_at: new Date().toISOString(),
    blockedWorks: p.blockedWorks,
    blockedRuns: p.blockedRuns,
  };
}

export function formatBlockedWorkDigestOutput(result) {
  return [
    '막힘업무요약',
    `- 생성시각: ${result.generated_at}`,
    '',
    '[blocked work]',
    ...(result.blockedWorks.length
      ? result.blockedWorks.map((w) => `- ${w.id} | ${w.title} | notes: ${w.notes || '없음'}`)
      : ['- 없음']),
    '',
    '[blocked run]',
    ...(result.blockedRuns.length
      ? result.blockedRuns.map((r) => `- ${r.run_id} (${r.work_id}) | ${r.error_summary || '사유 미기재'}`)
      : ['- 없음']),
    '',
    '대표 결정 필요 포인트',
    ...(result.blockedWorks.length || result.blockedRuns.length
      ? ['- blocker 해소를 위한 우선순위/자원 재배치 필요']
      : ['- 현재 특별 결정 필요 없음']),
  ].join('\n');
}

export async function runWeeklyReviewJob() {
  return {
    job_name: 'weekly_review',
    generated_at: new Date().toISOString(),
    note: 'stub: weekly review 템플릿만 제공',
  };
}

export function formatWeeklyReviewOutput(result) {
  return [
    '주간회고',
    `- 생성시각: ${result.generated_at}`,
    '- stub: 다음 패치에서 KPI/실패패턴/실행속도 지표를 연결하세요.',
  ].join('\n');
}
