/**
 * W11-F — propagation run audit (audit-only) compact lines.
 *
 * 입력: `project_space_key` + 해당 project space 의 최근 propagation 실행 묶음 배열
 *       (`{ run, steps }` 리스트).
 *
 * 본 모듈은 **pure**. 외부 I/O / 네트워크 호출 금지.
 * founder 본문에 들어가지 않는다(audit / 내부 리뷰 전용).
 *
 * 라인 예시:
 *   "run[c7d3] status=succeeded · attempted=3 completed=3 blocked=0 · modes=read_back,smoke · resumable=no"
 */

const MAX_LINES = 8;

function asString(v) {
  if (v == null) return '';
  const s = String(v);
  return s.trim();
}

function stripSecretLike(raw) {
  let s = asString(raw);
  if (!s) return '';
  s = s.replace(/https?:\/\/\S+/g, '[url]');
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]');
  s = s.replace(/\b(?:sk|pk|ghp|gho|ghu|glpat|xox[abpsor])[_-][A-Za-z0-9._-]{10,}/g, '[redacted]');
  s = s.replace(/\beyJ[A-Za-z0-9._-]{10,}/g, '[redacted-jwt]');
  s = s.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (m.length >= 32 ? '[redacted]' : m));
  return s;
}

function shortId(v) {
  const s = asString(v);
  if (!s) return '-';
  const hex = s.replace(/-/g, '');
  return hex.slice(0, 6) || s.slice(0, 6);
}

function rollupSteps(steps) {
  let attempted = 0;
  let completed = 0;
  let blocked = 0;
  const modes = new Set();
  for (const st of steps) {
    if (!st || typeof st !== 'object') continue;
    const status = asString(st.step_status);
    if (status === 'completed' || status === 'blocked' || status === 'failed') attempted += 1;
    if (status === 'completed') completed += 1;
    if (status === 'blocked' || status === 'failed') blocked += 1;
    const vk = asString(st.verification_kind);
    if (vk && vk !== 'none') modes.add(vk);
  }
  return { attempted, completed, blocked, modes: Array.from(modes).sort() };
}

/**
 * @param {{
 *   project_space_key: string,
 *   recent_propagation_runs: Array<{ run: Record<string, unknown>, steps: Array<Record<string, unknown>> }>,
 * }} input
 * @returns {{
 *   project_space_key: string,
 *   run_count: number,
 *   failed_run_count: number,
 *   propagation_run_audit_lines: string[],
 * }}
 */
export function buildPropagationRunAuditLines(input) {
  const key = input && input.project_space_key ? asString(input.project_space_key) : '';
  const runs = Array.isArray(input && input.recent_propagation_runs)
    ? input.recent_propagation_runs
    : [];

  let failedCount = 0;
  const lines = [];

  const scoped = key
    ? runs.filter((r) => r && r.run && asString(r.run.project_space_key) === key)
    : runs.slice();

  for (const entry of scoped) {
    const run = entry && entry.run && typeof entry.run === 'object' ? entry.run : null;
    if (!run) continue;
    const steps = Array.isArray(entry.steps) ? entry.steps : [];

    const id = shortId(run.id);
    const status = asString(run.status) || 'unknown';
    if (status === 'failed') failedCount += 1;

    const { attempted, completed, blocked, modes } = rollupSteps(steps);

    // resumable: 실패 run 에 blocked step 이 있거나 failure_resolution_class 가 hil_* / tool_adapter_* 일 때
    const rc = asString(run.failure_resolution_class);
    const isHil = /^hil_/.test(rc);
    const isAdapter = /tool_adapter|capability_missing/.test(rc);
    const resumable = status === 'failed' && (blocked > 0 || isHil || isAdapter);

    const segs = [
      `run[${id}]`,
      `status=${stripSecretLike(status)}`,
      `attempted=${attempted}`,
      `completed=${completed}`,
      `blocked=${blocked}`,
    ];
    if (modes.length) segs.push(`modes=${modes.map(stripSecretLike).join(',')}`);
    segs.push(`resumable=${resumable ? 'yes' : 'no'}`);

    lines.push(stripSecretLike(segs.join(' · ')));
    if (lines.length >= MAX_LINES) break;
  }

  return {
    project_space_key: key,
    run_count: scoped.length,
    failed_run_count: failedCount,
    propagation_run_audit_lines: lines,
  };
}
