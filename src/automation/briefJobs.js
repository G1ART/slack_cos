import {
  DECISIONS_FILE,
  LESSONS_FILE,
  INTERACTIONS_FILE,
  APPROVALS_FILE,
} from '../storage/paths.js';
import { getRecentRecords, readJsonArray } from '../storage/jsonStore.js';
import { formatPendingApprovalsSummary } from '../features/approvals.js';
import { listWorkItems } from '../features/workItems.js';
import { listWorkRuns } from '../features/workRuns.js';

export async function buildMorningBriefPayload() {
  const [decisions, lessons, interactions, approvals, works, runs] = await Promise.all([
    getRecentRecords(DECISIONS_FILE, 5),
    getRecentRecords(LESSONS_FILE, 5),
    getRecentRecords(INTERACTIONS_FILE, 8),
    readJsonArray(APPROVALS_FILE),
    listWorkItems({ count: 100, openOnly: true }),
    listWorkRuns({ count: 100 }),
  ]);
  return { decisions, lessons, interactions, approvals, works, runs };
}

export async function runMorningBriefJob() {
  const p = await buildMorningBriefPayload();
  const pendingApprovals = p.approvals.filter((a) => a.status === 'pending').slice(0, 8);
  const blockedWorks = p.works.filter((w) => w.status === 'blocked').slice(0, 8);
  const recentDoneRuns = p.runs.filter((r) => r.status === 'done').slice(0, 5);
  return {
    job_name: 'morning_brief',
    generated_at: new Date().toISOString(),
    pendingApprovals,
    blockedWorks,
    recentDoneRuns,
    topPriority: p.works
      .filter((w) => ['draft', 'approved', 'assigned', 'in_progress'].includes(w.status))
      .slice(0, 3),
  };
}

export function formatMorningBriefOutput(result) {
  const approvalText =
    result.pendingApprovals.length > 0
      ? formatPendingApprovalsSummary(result.pendingApprovals).text || formatPendingApprovalsSummary(result.pendingApprovals)
      : '현재 승인 대기 안건이 없습니다.';
  return [
    '아침브리프',
    `- 생성시각: ${result.generated_at}`,
    '',
    '[승인대기]',
    approvalText,
    '',
    '[막힘업무]',
    ...(result.blockedWorks.length
      ? result.blockedWorks.map((w) => `- ${w.id} | ${w.title} | ${w.notes || '사유 미기재'}`)
      : ['- 없음']),
    '',
    '[전일 핵심 결과]',
    ...(result.recentDoneRuns.length
      ? result.recentDoneRuns.map((r) => `- ${r.run_id} (${r.work_id}) | ${r.result_summary || '요약 없음'}`)
      : ['- 없음']),
    '',
    '[오늘 최우선]',
    ...(result.topPriority.length
      ? result.topPriority.map((w) => `- ${w.id} | ${w.title} | 상태:${w.status}`)
      : ['- 없음']),
  ].join('\n');
}

export async function buildEveningWrapPayload() {
  const [works, runs] = await Promise.all([
    listWorkItems({ count: 200, openOnly: false }),
    listWorkRuns({ count: 200 }),
  ]);
  return { works, runs };
}

export async function runEveningWrapJob() {
  const p = await buildEveningWrapPayload();
  return {
    job_name: 'evening_wrap',
    generated_at: new Date().toISOString(),
    doneWorks: p.works.filter((w) => w.status === 'done').slice(0, 8),
    failedRuns: p.runs.filter((r) => ['failed', 'blocked'].includes(r.status)).slice(0, 8),
    pendingWorks: p.works.filter((w) => !['done', 'canceled'].includes(w.status)).slice(0, 8),
  };
}

export function formatEveningWrapOutput(result) {
  return [
    '저녁정리',
    `- 생성시각: ${result.generated_at}`,
    '',
    '[오늘 완료]',
    ...(result.doneWorks.length
      ? result.doneWorks.map((w) => `- ${w.id} | ${w.title}`)
      : ['- 없음']),
    '',
    '[실패/보류/막힘 실행]',
    ...(result.failedRuns.length
      ? result.failedRuns.map((r) => `- ${r.run_id} | ${r.status} | ${r.error_summary || '사유 미기재'}`)
      : ['- 없음']),
    '',
    '[내일 첫 액션 후보]',
    ...(result.pendingWorks.length
      ? result.pendingWorks.map((w) => `- ${w.id} | ${w.title} | 상태:${w.status}`)
      : ['- 없음']),
  ].join('\n');
}
