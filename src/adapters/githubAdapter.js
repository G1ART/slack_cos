import { App as OctokitApp } from '@octokit/app';
import { Octokit } from '@octokit/rest';

function safeTrim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function slugify(text) {
  return safeTrim(text)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function truncate(text, max) {
  const s = safeTrim(text);
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 3))}...`;
}

function inferRepo(workItem) {
  return workItem.repo_key || workItem.project_github_repo || null || 'manual';
}

function getGithubEnvConfig() {
  return {
    appId: process.env.GITHUB_APP_ID || null,
    appPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY || null,
    installationId: process.env.GITHUB_APP_INSTALLATION_ID || null,
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER || null,
    defaultRepo: process.env.GITHUB_DEFAULT_REPO || null,
  };
}

/** Fine-grained PAT (Phase 1a 권장). 일반 `GITHUB_TOKEN`도 허용(호환). */
export function getGithubPat() {
  return safeTrim(process.env.GITHUB_FINE_GRAINED_PAT || process.env.GITHUB_TOKEN || '');
}

export function isGithubPatConfigured() {
  return Boolean(getGithubPat());
}

export function isGithubAppConfigured() {
  const c = getGithubEnvConfig();
  return Boolean(c.appId && c.appPrivateKey && c.installationId);
}

/** Issue live API 호출에 사용 가능한 인증(PAT 우선, 없으면 GitHub App). */
export function isGithubAuthConfigured() {
  return isGithubPatConfigured() || isGithubAppConfigured();
}

export function getGithubAuthMode() {
  if (isGithubPatConfigured()) return 'pat';
  if (isGithubAppConfigured()) return 'github_app';
  return 'none';
}

function parseRepoTarget(repoKey) {
  const t = safeTrim(repoKey);
  if (!t || t === 'manual') return null;
  const m = t.match(/^([^/]+)\/([^/]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function resolveGitHubRepoTarget({ repoKey }) {
  const env = getGithubEnvConfig();

  const direct = parseRepoTarget(repoKey);
  if (direct) return { ...direct, source: 'repo_key' };

  if (repoKey && !repoKey.includes('/')) {
    if (env.defaultOwner) {
      return { owner: env.defaultOwner, repo: repoKey, source: 'default_owner+repo_key' };
    }
  }

  if (env.defaultOwner && env.defaultRepo) {
    return { owner: env.defaultOwner, repo: env.defaultRepo, source: 'env_default' };
  }

  return null;
}

let appClient = null;
let installationTokenCache = {
  token: null,
  expiresAtMs: 0,
};

function getOctokitApp() {
  const cfg = getGithubEnvConfig();
  if (!cfg.appId || !cfg.appPrivateKey) return null;
  if (!appClient) {
    appClient = new OctokitApp({
      appId: cfg.appId,
      privateKey: cfg.appPrivateKey.replace(/\\n/g, '\n'),
    });
  }
  return appClient;
}

async function getInstallationToken() {
  const cfg = getGithubEnvConfig();
  if (!isGithubAppConfigured()) {
    throw new Error('github_app_env_missing');
  }

  const now = Date.now();
  if (installationTokenCache.token && installationTokenCache.expiresAtMs - now > 60_000) {
    return installationTokenCache.token;
  }

  const app = getOctokitApp();
  const auth = await app.getInstallationOctokit(Number(cfg.installationId));
  const token = auth.auth;
  const authData = await token({ type: 'installation' });
  installationTokenCache = {
    token: authData.token,
    expiresAtMs: Date.parse(authData.expiresAt || '') || now + 55 * 60 * 1000,
  };
  return installationTokenCache.token;
}

async function getOctokitForIssues() {
  const pat = getGithubPat();
  if (pat) {
    return new Octokit({ auth: pat });
  }
  if (isGithubAppConfigured()) {
    const token = await getInstallationToken();
    return new Octokit({ auth: token });
  }
  const err = new Error('github_auth_missing');
  throw err;
}

/** 토큰/URL 등 민감정보 없이 사용자/로그용 한 줄 요약 */
export function formatGithubIssueCommandError(error) {
  const status = error?.status;
  const code = error?.response?.data?.message || error?.message || String(error);

  if (code === 'github_auth_missing' || /github_auth_missing/i.test(String(code))) {
    return {
      category: 'auth',
      userMessage:
        'GitHub 인증 설정이 없습니다.\n' +
        '- 권장: `GITHUB_FINE_GRAINED_PAT` (fine-grained PAT, issues/repo 권한)\n' +
        '- 또는: GitHub App env (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`)',
    };
  }

  if (status === 401 || status === 403) {
    return {
      category: 'auth',
      userMessage: `GitHub 인증/권한 실패 (HTTP ${status}). PAT/repo 권한·만료·스코프를 확인하세요.`,
    };
  }
  if (status === 404) {
    return {
      category: 'github_api',
      userMessage: 'GitHub API: 리포지토리 또는 이슈를 찾을 수 없습니다(404). owner/repo·권한을 확인하세요.',
    };
  }
  if (status === 422) {
    return {
      category: 'github_api',
      userMessage: `GitHub API: 요청 검증 실패(422). ${typeof code === 'string' ? code.slice(0, 200) : '본문/필드 확인'}`,
    };
  }
  if (status >= 500) {
    return {
      category: 'github_api',
      userMessage: `GitHub 서버 오류(HTTP ${status}). 잠시 후 재시도하세요.`,
    };
  }

  return {
    category: 'github_api',
    userMessage: `GitHub API 오류${status ? ` (HTTP ${status})` : ''}: ${String(code).slice(0, 240)}`,
  };
}

/** Slack/업무상세/실행상세용 issue artifact 요약 블록 (토큰 없음) */
export function formatGithubArtifactSummaryLines(artifact, { header = '── GitHub issue ──' } = {}) {
  if (!artifact || artifact.provider !== 'github' || artifact.artifact_type !== 'issue') return [];
  return [
    header,
    `- repo: ${artifact.repo_owner}/${artifact.repo_name}`,
    `- issue_number: #${artifact.issue_number}`,
    `- issue_url: ${artifact.issue_url}`,
    `- state: ${artifact.state ?? 'unknown'}`,
    `- updated_at: ${artifact.updated_at ?? 'unknown'}`,
    `- sync_status: ${artifact.sync_status ?? 'unknown'}`,
  ];
}

/**
 * read-only: 인증·기본 target repo·issues API 읽기 경로 점검 (destructive 없음)
 */
export async function runGithubPrecheck() {
  const stages = [];
  const result = {
    overall: 'fail',
    auth_configured: isGithubAuthConfigured(),
    auth_mode: getGithubAuthMode(),
    target: null,
    target_source: null,
    issues_readiness: { ok: false, label: '미검사' },
    stages,
  };

  stages.push({
    name: 'auth',
    ok: result.auth_configured,
    note: result.auth_configured ? `mode=${result.auth_mode}` : 'GITHUB_FINE_GRAINED_PAT 또는 GitHub App env',
  });

  if (!result.auth_configured) {
    stages.push({ name: 'repo_resolve', ok: false, note: 'skipped (auth 실패)' });
    stages.push({ name: 'issue_create', ok: false, note: 'skipped' });
    stages.push({ name: 'persist', ok: null, note: 'n/a (점검은 저장 안 함)' });
    stages.push({ name: 'sync', ok: false, note: 'skipped' });
    result.issues_readiness = { ok: false, label: '인증 미설정' };
    return result;
  }

  const repoTarget = resolveGitHubRepoTarget({ repoKey: '' });
  const rrOk = Boolean(repoTarget);
  stages.push({
    name: 'repo_resolve',
    ok: rrOk,
    note: rrOk ? `${repoTarget.owner}/${repoTarget.repo} (${repoTarget.source})` : 'GITHUB_DEFAULT_OWNER/REPO 또는 owner/repo',
  });

  if (!repoTarget) {
    stages.push({ name: 'issue_create', ok: false, note: 'skipped' });
    stages.push({ name: 'persist', ok: null, note: 'n/a' });
    stages.push({ name: 'sync', ok: false, note: 'skipped' });
    result.issues_readiness = { ok: false, label: 'target repo resolve 실패' };
    return result;
  }

  result.target = `${repoTarget.owner}/${repoTarget.repo}`;
  result.target_source = repoTarget.source;

  try {
    const octokit = await getOctokitForIssues();
    const { data: repoMeta } = await octokit.repos.get({
      owner: repoTarget.owner,
      repo: repoTarget.repo,
    });
    stages.push({
      name: 'issue_create',
      ok: true,
      note: `repos.get OK, has_issues=${repoMeta.has_issues !== false}`,
    });
    stages.push({ name: 'persist', ok: null, note: 'n/a (점검은 work_item에 쓰지 않음)' });

    if (repoMeta.has_issues === false) {
      stages.push({ name: 'sync', ok: false, note: 'repo에서 Issues 비활성' });
      result.issues_readiness = { ok: false, label: 'repo 설정에서 Issues가 꺼져 있음' };
      result.overall = 'fail';
      return result;
    }

    await octokit.issues.listForRepo({
      owner: repoTarget.owner,
      repo: repoTarget.repo,
      per_page: 1,
      state: 'all',
    });
    stages.push({ name: 'sync', ok: true, note: 'issues.listForRepo OK' });
    result.issues_readiness = {
      ok: true,
      label: 'repo + issues 읽기 API 통과 (실제 생성은 이슈발행으로 검증)',
    };
    result.overall = 'pass';
  } catch (e) {
    const { category, userMessage } = formatGithubIssueCommandError(e);
    stages.push({ name: 'issue_create', ok: false, note: category });
    stages.push({ name: 'persist', ok: null, note: 'n/a' });
    stages.push({ name: 'sync', ok: false, note: 'skipped' });
    result.issues_readiness = {
      ok: false,
      label: userMessage.split('\n')[0].slice(0, 160),
    };
    result.overall = 'fail';
  }

  return result;
}

export function formatGithubPrecheckForSlack(r) {
  const overallLabel = r.overall === 'pass' ? 'PASS' : r.overall === 'warn' ? 'WARN' : 'FAIL';
  const lines = [
    '깃허브점검 (read-only)',
    `- overall: ${overallLabel}`,
    `- auth configured: ${r.auth_configured ? 'yes' : 'no'}`,
    `- auth mode: ${r.auth_mode}`,
  ];
  if (r.target) {
    lines.push(`- target repo: ${r.target}${r.target_source ? ` (${r.target_source})` : ''}`);
  } else {
    lines.push('- target repo: (없음 — repo_resolve 필요)');
  }
  lines.push(
    `- issues path readiness: ${r.issues_readiness.ok ? 'yes' : 'no'} — ${r.issues_readiness.label}`
  );
  lines.push('- stages:');
  for (const s of r.stages) {
    const ok =
      s.ok === true ? 'ok' : s.ok === false ? 'fail' : s.ok === null ? 'n/a' : String(s.ok);
    lines.push(`  - ${s.name}: ${ok}${s.note ? ` — ${s.note}` : ''}`);
  }
  return lines.join('\n');
}

function buildIssueBody(workItem, metadata = {}) {
  const lines = [];
  lines.push('## Brief');
  lines.push(workItem.brief || '(empty)');
  lines.push('');
  lines.push('## Context');
  lines.push(`- project_key: ${workItem.project_key}`);
  lines.push(`- work_id: ${workItem.id}`);
  lines.push(`- priority: ${workItem.priority || 'normal'}`);
  lines.push(`- owner_type: ${workItem.owner_type || 'none'}`);
  lines.push(`- assigned_persona: ${workItem.assigned_persona || 'none'}`);
  lines.push(`- assigned_tool: ${workItem.assigned_tool || workItem.tool_key || 'none'}`);
  lines.push(`- approval_status: ${workItem.approval_status || 'not_required'}`);
  lines.push(`- work_type: ${workItem.work_type || 'feature'}`);
  lines.push('');
  lines.push('## Requested Outcome');
  const outcome = Array.isArray(workItem.acceptance_criteria) && workItem.acceptance_criteria.length
    ? workItem.acceptance_criteria.map((x) => `- ${x}`).join('\n')
    : '- acceptance_criteria가 비어 있어 구현 결과 기준을 명시해 주세요.';
  lines.push(outcome);
  lines.push('');
  lines.push('## Slack Source');
  lines.push(`- source_channel: ${workItem.source_channel || metadata.channel || 'unknown'}`);
  lines.push(`- source_message_ts: ${workItem.source_message_ts || 'unknown'}`);
  lines.push(`- requested_by: ${metadata.user || 'unknown'}`);
  lines.push('');
  lines.push('## Internal Tracking');
  lines.push(`- provider: github`);
  lines.push(`- artifact_type: issue`);
  lines.push(`- work_item_id: ${workItem.id}`);
  if (metadata.runId) lines.push(`- work_run_id: ${metadata.runId}`);
  return lines.join('\n');
}

function getExistingIssueArtifact(workItem, repoTarget) {
  const artifacts = Array.isArray(workItem.github_artifacts) ? workItem.github_artifacts : [];
  return (
    artifacts.find(
      (a) =>
        a?.provider === 'github' &&
        a?.artifact_type === 'issue' &&
        a?.repo_owner === repoTarget.owner &&
        a?.repo_name === repoTarget.repo &&
        a?.sync_status !== 'deleted'
    ) || null
  );
}

export async function createIssueArtifact({ workItem, repoTarget, metadata = {} }) {
  const existing = getExistingIssueArtifact(workItem, repoTarget);
  if (existing) {
    try {
      const gh = await getOctokitForIssues();
      const resp = await gh.issues.get({
        owner: repoTarget.owner,
        repo: repoTarget.repo,
        issue_number: existing.issue_number,
      });
      const live = resp.data;
      const refreshed = {
        ...existing,
        state: live.state,
        updated_at: live.updated_at,
        issue_url: live.html_url || existing.issue_url,
        sync_status: 'synced',
      };
      return { ok: true, duplicate: true, artifact: refreshed };
    } catch {
      return { ok: true, duplicate: true, artifact: existing };
    }
  }

  const gh = await getOctokitForIssues();
  const title = inferIssueTitle(workItem);
  const body = buildIssueBody(workItem, metadata);

  const resp = await gh.issues.create({
    owner: repoTarget.owner,
    repo: repoTarget.repo,
    title,
    body,
  });

  const issue = resp.data;
  const artifact = {
    provider: 'github',
    artifact_type: 'issue',
    repo_owner: repoTarget.owner,
    repo_name: repoTarget.repo,
    issue_number: issue.number,
    issue_id: issue.id,
    issue_url: issue.html_url,
    state: issue.state,
    created_at: issue.created_at || new Date().toISOString(),
    updated_at: issue.updated_at || issue.created_at || new Date().toISOString(),
    sync_status: 'created',
  };
  return { ok: true, duplicate: false, artifact, issue };
}

export async function getIssueStatus({ owner, repo, issue_number }) {
  const gh = await getOctokitForIssues();
  const resp = await gh.issues.get({
    owner,
    repo,
    issue_number,
  });
  return resp.data;
}

function inferGitHubKind(workItem) {
  const kind = workItem.github_kind;
  if (kind === 'issue' || kind === 'branch' || kind === 'pr' || kind === 'mixed') return kind;
  return workItem.github_kind || 'pr';
}

function inferBranchName(workItem) {
  const slug = slugify(workItem.branch_name || workItem.title || workItem.issue_title || 'task');
  const wt = workItem.work_type;
  if (wt === 'bug') return `fix/${slug}`;
  if (wt === 'feature') return `feat/${slug}`;
  if (wt === 'refactor') return `refactor/${slug}`;
  if (wt === 'ops') return `chore/${slug}`;
  if (wt === 'data') return `data/${slug}`;
  return `work/${slug}`;
}

function inferIssueTitle(workItem) {
  const t = workItem.issue_title || workItem.title || 'Work';
  return truncate(t, 70);
}

function inferPrTitle(workItem) {
  const t = workItem.pr_title || workItem.pr_title || workItem.title || 'PR';
  return truncate(t, 80);
}

function buildIssuePayload(workItem) {
  const repo = inferRepo(workItem);
  return {
    kind: 'github_issue_payload',
    repo,
    title: inferIssueTitle(workItem),
    problem_statement: safeTrim(workItem.brief) || '문제/목표를 명확히 정의하세요.',
    acceptance_criteria: Array.isArray(workItem.acceptance_criteria) && workItem.acceptance_criteria.length
      ? workItem.acceptance_criteria
      : ['acceptance 정의 필요'],
    labels_suggest: [
      workItem.work_type,
      workItem.priority,
      workItem.project_key,
      workItem.approval_required ? 'approval' : null,
    ].filter(Boolean),
    priority: workItem.priority,
    related_context: safeTrim(workItem.notes) || safeTrim(workItem.brief) || '없음',
    done_definition: ['요청 범위 충족', '테스트/검토 완료', 'handoff/doc 반영 여부 명시'],
  };
}

function buildBranchPayload(workItem) {
  const repo = inferRepo(workItem);
  return {
    kind: 'github_branch_task_payload',
    repo,
    suggested_branch_name: workItem.branch_name || inferBranchName(workItem),
    scope: safeTrim(workItem.brief) || '범위를 명확히 정의하세요.',
    files_likely_touched: [],
    guardrails: ['scope creep 방지', '회귀 영향 최소화', '핵심 리스크 문서화'],
    tests_required: ['minimum regression + acceptance checks'],
  };
}

function buildPrPayload(workItem) {
  const repo = inferRepo(workItem);
  const branch = workItem.branch_name || inferBranchName(workItem);
  return {
    kind: 'github_pr_payload',
    repo,
    branch,
    pr_title: inferPrTitle(workItem),
    summary: safeTrim(workItem.brief) || '요약을 작성하세요.',
    changed_files: [],
    tests_run: [],
    risks: [],
    review_checklist: [
      'scope creep 없는가',
      'acceptance criteria 충족하는가',
      '테스트 결과가 충분한가',
      'blocker가 명확한가',
      '위험이 merge 가능한 수준인가',
      'handoff/doc 업데이트가 필요한가',
    ],
    merge_readiness: 'unknown',
  };
}

function buildMixedPayload(workItem) {
  return {
    kind: 'github_issue+branch+pr_payload',
    repo: inferRepo(workItem),
    issue: buildIssuePayload(workItem),
    branch: buildBranchPayload(workItem),
    pr: buildPrPayload(workItem),
  };
}

export function prepareDispatch(workItem) {
  const kind = inferGitHubKind(workItem);
  if (kind === 'issue') return buildIssuePayload(workItem);
  if (kind === 'branch') return buildBranchPayload(workItem);
  if (kind === 'pr') return buildPrPayload(workItem);
  if (kind === 'mixed') return buildMixedPayload(workItem);
  return buildPrPayload(workItem);
}

export function createRun(workItem, metadata = {}) {
  const payloadKind = (() => {
    const kind = inferGitHubKind(workItem);
    if (kind === 'issue') return 'issue';
    if (kind === 'branch') return 'issue';
    if (kind === 'pr') return 'pr';
    if (kind === 'mixed') return 'issue+pr';
    return null;
  })();

  return {
    project_key: workItem.project_key,
    tool_key: 'github',
    adapter_type: 'github_adapter',
    dispatch_payload: prepareDispatch(workItem),
    dispatch_target: metadata.dispatch_target || 'github_manual_paste',
    created_by: metadata.user || null,
    notes: metadata.note || '',
    executor_type: 'github',
    executor_session_label: metadata.executor_session_label || null,
    repo_key: workItem.repo_key || null,
    branch_name: workItem.branch_name || inferBranchName(workItem),
    issue_key: workItem.issue_key || null,
    pr_key: workItem.pr_key || null,
    github_status: 'drafted',
    github_payload_kind: payloadKind,
    review_summary: '',
    merge_readiness: 'unknown',
  };
}

export function formatDispatchForSlack(run) {
  const preview = JSON.stringify(run.dispatch_payload, null, 2);
  return [
    `실행 ID: ${run.run_id}`,
    `업무 ID: ${run.work_id}`,
    `프로젝트: ${run.project_key}`,
    `도구: ${run.tool_key}`,
    `현재 상태: ${run.status}`,
    '',
    '[payload preview]',
    preview.slice(0, 1800),
    '',
    '다음 권장 액션: issue/branch/PR을 실제로 생성/수정한 뒤, 결과를 `결과등록 <run_id>: ...`로 회수하세요.',
  ].join('\n');
}

export function formatResultForSlack(run) {
  return [
    `실행 결과 (${run.run_id})`,
    `- 상태: ${run.status}`,
    `- result_status: ${run.result_status || 'none'}`,
    `- github_status: ${run.github_status || 'none'}`,
    `- review_summary: ${run.review_summary || '없음'}`,
    `- merge_readiness: ${run.merge_readiness || 'unknown'}`,
    `- 변경 파일 수: ${(run.changed_files || []).length}`,
    `- 테스트 통과: ${run.tests_passed === null ? '미기재' : run.tests_passed ? '예' : '아니오'}`,
  ].join('\n');
}

function parseChangedFiles(text) {
  const matches =
    String(text || '').match(/(?:^|\n)\s*[-*]\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=\s|$)/g) || [];
  return [...new Set(matches.map((m) => m.replace(/^[-*]\s*/, '').trim()))].slice(0, 50);
}

function parseTestLines(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const tests = lines.filter((l) => /test|테스트|npm|pnpm|yarn|jest|vitest|pytest/i.test(l)).slice(0, 30);
  return tests;
}

function parseBlockers(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const blockers = lines
    .filter((l) => /^[-*]\s+/.test(l) && /(block|막힘|차단|의존)/i.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .slice(0, 20);
  return blockers;
}

function parseUnresolvedRisks(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const risks = lines
    .filter((l) => /^[-*]\s+/.test(l) && /(리스크|미해결|unresolved)/i.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .slice(0, 20);
  return risks;
}

function extractSectionText(text, startMarkers) {
  const raw = String(text || '');
  const lines = raw.split('\n');
  const startIdx = lines.findIndex((l) => startMarkers.some((m) => l.includes(m)));
  if (startIdx < 0) return '';
  const chunk = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(변경한 파일 목록|핵심 변경 사항|테스트 실행 결과|남은 리스크|blocker|남은 blocker|review|merge readiness)/i.test(line.trim()) && chunk.length) break;
    if (/^(\d+\.|[-*]\s)/.test(line.trim()) || line.trim()) {
      chunk.push(line);
    }
  }
  return chunk.join('\n').trim();
}

export function parseGitHubResultIntake(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();

  const changed_files = parseChangedFiles(raw);
  const tests_run = parseTestLines(raw);

  const tests_passed =
    /(all\s+pass|통과|passed|성공)/i.test(lower)
      ? true
      : /(fail|실패|error|에러)/i.test(lower)
        ? false
        : null;

  const unresolved_risks = parseUnresolvedRisks(raw);
  const blockers = parseBlockers(raw);

  const branch_name =
    raw.match(/(?:branch_name|Branch)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const issue_title = raw.match(/(?:issue_title|Issue)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const pr_title = raw.match(/(?:pr_title|PR)\s*[:=]\s*([^\n\r]+)/i)?.[1]?.trim() || null;

  const review_summary =
    raw.match(/(?:review_summary|대표 검토 요약)\s*[:=]\s*([\s\S]+?)(?:\n\n|$)/i)?.[1]?.trim() ||
    extractSectionText(raw, ['대표 검토 요약']) ||
    '';

  const merge_readiness = (() => {
    if (/merge readiness\s*[:=]\s*ready/i.test(raw) || /merge\s*준비\s*[:=]?\s*ready/i.test(raw) || /merge\s*(가능|ready)/i.test(raw)) {
      return 'ready';
    }
    if (/merge readiness\s*[:=]\s*not_ready/i.test(raw) || /merge\s*(불가|not_ready|보류)/i.test(raw)) {
      return 'not_ready';
    }
    return 'unknown';
  })();

  return {
    repo_key: null,
    branch_name,
    issue_title,
    pr_title,
    changed_files,
    tests_run,
    tests_passed,
    unresolved_risks,
    blockers,
    review_summary: truncate(review_summary, 500),
    merge_readiness,
  };
}

// workRuns의 일반 결과 intake 파이프라인과 호환되는 이름
export function parseResultIntake(text) {
  const parsed = parseGitHubResultIntake(text);
  // workRuns에 필요한 필드들만 우선 전달
  return {
    changed_files: parsed.changed_files,
    tests_run: parsed.tests_run,
    tests_passed: parsed.tests_passed,
    unresolved_risks: parsed.unresolved_risks,
    blockers: parsed.blockers,
    review_summary: parsed.review_summary,
    merge_readiness: parsed.merge_readiness,
    // workItems 업데이트용 필드는 app.js에서 별도 처리(무시 가능)
    branch_name: parsed.branch_name,
    issue_title: parsed.issue_title,
    pr_title: parsed.pr_title,
  };
}
