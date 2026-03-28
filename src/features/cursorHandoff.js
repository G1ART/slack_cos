import fs from 'fs/promises';
import path from 'path';

import { CURSOR_HANDOFFS_DIR } from '../storage/paths.js';

function safeTrim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function extractGithubIssueFromWorkItem(item) {
  if (!item) return null;
  const arts = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
  const fromList = arts.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue');
  if (fromList) return fromList;
  if (item.github_artifact?.artifact_type === 'issue') return item.github_artifact;
  return null;
}

/**
 * Cursor에 그대로 붙여넣기 좋은 handoff/spec 마크다운
 */
export function buildCursorHandoffMarkdown(workItem, ctx = {}) {
  const {
    envKey = 'dev',
    envDisplayName = null,
    channelId = null,
    githubIssue = null,
    resolvedRepoHint = null,
    planId = null,
    workspaceQueueId = null,
  } = ctx;

  const pid = workItem.source_plan_id || planId || null;
  const wq = workItem.source_workspace_queue_id || workspaceQueueId || null;

  const ac = Array.isArray(workItem.acceptance_criteria) ? workItem.acceptance_criteria : [];
  const acText = ac.length ? ac.map((x) => `- ${x}`).join('\n') : '- (비어 있음 — 구현 전 보완)';

  const ghBlock = githubIssue
    ? [
        '## 관련 GitHub Issue',
        `- repo: \`${githubIssue.repo_owner}/${githubIssue.repo_name}\``,
        `- issue: #${githubIssue.issue_number}`,
        `- url: ${githubIssue.issue_url}`,
        `- state (마지막 동기화 기준): ${githubIssue.state || 'unknown'}`,
        '',
      ].join('\n')
    : [
        '## 관련 GitHub Issue',
        '- (없음) — 필요 시 Slack에서 `이슈발행` 후 이 문서를 보강하거나 issue 링크를 수동 기입',
        '',
      ].join('\n');

  return [
    `# Cursor Handoff / Spec — ${workItem.id}`,
    '',
    '> Slack G1 COS에서 생성됨. 아래를 Cursor 채팅/에이전트에 붙여넣거나, 이 파일을 워크스페이스에서 열어 참조하세요.',
    '',
    '## 메타',
    `- **work_id**: \`${workItem.id}\``,
    `- **project_key**: \`${workItem.project_key}\``,
    `- **priority**: ${workItem.priority || 'normal'}`,
    `- **assigned_persona**: ${workItem.assigned_persona || 'none'}`,
    `- **assigned_tool**: ${workItem.assigned_tool || workItem.tool_key || 'cursor'}`,
    `- **owner_type**: ${workItem.owner_type || 'none'}`,
    `- **approval_status**: ${workItem.approval_status || 'not_required'}`,
    `- **work_type**: ${workItem.work_type || 'feature'}`,
    `- **Slack env profile (채널 기준)**: ${envKey}${envDisplayName ? ` (${envDisplayName})` : ''}`,
    `- **source_channel_id**: ${channelId || 'unknown'}`,
    `- **연동 repo 힌트 (registry)**: ${resolvedRepoHint || '없음'}`,
    '',
    '## COS 링크 (Slack에서의 실행 추적)',
    `- **plan_id**: ${pid ? `\`${pid}\` — Slack: \`계획상세 ${pid}\` · \`계획진행 ${pid}\`` : '(없음)'}`,
    `- **실행 큐 (spec 인입)**: ${wq ? `\`${wq}\` — 승격·감사 추적` : '(해당 없음)'}`,
    '',
    ghBlock,
    '## 목표 / 요청 결과 (Goal / Requested outcome)',
    `- **title**: ${workItem.title}`,
    `- **brief**:`,
    '',
    workItem.brief || '(empty)',
    '',
    '## 구현 범위 (In scope)',
    '- 위 brief 및 acceptance criteria 충족',
    '- 기존 Slack 명령·approval·storage 추상화 회귀 없음',
    '- 최소 침습 패치 원칙',
    '',
    '## 제외 범위 (Out of scope)',
    '- Cursor 원격 자동 제어, hosted 자동 배포, broad multi-project 일반화',
    '- GitHub branch/PR 자동 생성(별도 마일스톤)',
    '- scheduler / 일반 채널 전체 수신 확장',
    '',
    '## 검증 기준 (Acceptance)',
    acText,
    '',
    '## 의존성 / 메모',
    `- dependencies: ${(workItem.dependencies || []).join(', ') || '없음'}`,
    `- notes: ${workItem.notes || '없음'}`,
    '',
    '## Handoff / 문서 업데이트 요구',
    '- 동작·명령·운영 절차가 바뀌면 `docs/G1_ART_Slack_COS_Handoff_*.md` 또는 관련 문서를 갱신할 것',
    '- 이 작업이 GitHub issue와 연결되어 있으면 issue에 요약 링크/코멘트 남길 것',
    '',
    '## 결과 보고 (Cursor → Slack COS 회수 시)',
    '완료 후 Slack에서 `커서결과기록 <run_id|work_id> <한 줄 요약>` 으로 알려주세요.',
    '예: `커서결과기록 RUN-260319-01 패치완료: handoff 경로 반영 및 lint 통과`',
    '',
    '---',
    '',
    '## Cursor 패킷 (요약 체크리스트)',
    '1. 관련 파일 읽기 → 최소 변경',
    '2. `node --check` / lint / 핵심 시나리오',
    '3. 토큰·키 로그 금지',
    '4. 회귀: 업무/승인/저장소 명령',
  ].join('\n');
}

export async function writeCursorHandoffFile({ workId, runId, markdown }) {
  await fs.mkdir(CURSOR_HANDOFFS_DIR, { recursive: true });
  const safeWork = String(workId).replace(/[^a-zA-Z0-9-_]/g, '_');
  const safeRun = String(runId).replace(/[^a-zA-Z0-9-_]/g, '_');
  const fname = `${safeWork}_${safeRun}_handoff.md`;
  const abs = path.join(CURSOR_HANDOFFS_DIR, fname);
  await fs.writeFile(abs, markdown, 'utf8');
  const rel = path.posix.join('docs', 'cursor-handoffs', fname);
  return {
    abs,
    handoff_path: rel,
    handoff_title: `Cursor handoff ${workId} (${runId})`,
  };
}

export function buildCursorHandoffArtifact({
  work_id = null,
  run_id = null,
  handoff_path,
  handoff_title,
  linked_github_issue = null,
  dispatch_status = 'cursor_in_progress',
}) {
  const now = new Date().toISOString();
  return {
    provider: 'cursor',
    artifact_type: 'handoff',
    work_id,
    run_id,
    handoff_path,
    handoff_title,
    dispatch_status,
    linked_github_issue,
    result_status: 'none',
    result_notes: '',
    result_recorded_at: null,
    created_at: now,
    updated_at: now,
  };
}

export function formatCursorHandoffSummaryLines(artifact, { header = '── Cursor handoff ──' } = {}) {
  if (!artifact || artifact.provider !== 'cursor' || artifact.artifact_type !== 'handoff') return [];
  const gh = artifact.linked_github_issue;
  const ghLine = gh
    ? `linked_issue: #${gh.issue_number} ${gh.issue_url || ''}`
    : 'linked_issue: (없음)';
  return [
    header,
    `- work_id: ${artifact.work_id || 'unknown'}`,
    `- run_id: ${artifact.run_id || 'unknown'}`,
    `- handoff_path: ${artifact.handoff_path || 'unknown'}`,
    `- handoff_title: ${artifact.handoff_title || 'unknown'}`,
    `- dispatch_status: ${artifact.dispatch_status || 'unknown'}`,
    `- result_status: ${artifact.result_status || 'none'}`,
    `- result_notes: ${artifact.result_notes || '없음'}`,
    `- ${ghLine}`,
    `- updated_at: ${artifact.updated_at || 'unknown'}`,
  ];
}

/** 커서결과기록 ingest 시 artifact에 결과 필드 병합 */
export function mergeCursorHandoffResult(artifact, { summary, inferredStatus }) {
  if (!artifact || artifact.provider !== 'cursor' || artifact.artifact_type !== 'handoff') return artifact;
  const now = new Date().toISOString();
  return {
    ...artifact,
    result_status: inferredStatus,
    result_notes: safeTrim(summary),
    result_recorded_at: now,
    updated_at: now,
  };
}

export function inferCursorIngestResultStatus(text) {
  const t = safeTrim(text).toLowerCase();
  if (/(실패|fail|error|에러|불가|blocked)/.test(t)) return 'failed';
  if (/(추가\s*수정|후속|더\s*필요|pending|보완|재작업)/.test(t)) return 'needs_followup';
  if (
    /(완료|패치\s*완료|done|complete|적용\s*완료|구현\s*완료|반영\s*완료|1차\s*구현|성공)/.test(t)
  ) {
    return 'patch_complete';
  }
  return 'unknown';
}
