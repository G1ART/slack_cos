/**
 * W11-F — human-gate resume audit (audit-only) compact lines.
 *
 * 입력: `project_space_key` + 해당 project space 의 human gate 행 배열(미해결 기준이지만
 *        조회된 open/closed 혼합이어도 OK — 본 모듈은 gate_status 에 의존하지 않는다).
 *
 * 본 모듈은 **pure** 이다. Slack/Supabase/외부 I/O 를 호출하지 않는다.
 * founder 본문에는 붙지 않는다(audit / 내부 리뷰 슬라이스 전용).
 *
 * 라인 예시:
 *   "gate[a3f1] kind=repo_binding · reopened=2 · resume=human_action/fix-token · cont=packet:P|run:R|thread:T"
 *
 * 시크릿/URL/토큰은 절대 포함되지 않는다(입력이 값이 아니라 이름/ref 만 담는다는 전제 + 추가 redact).
 */

import { deriveContinuationKey } from './humanGateRuntime.js';

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

/**
 * @param {{
 *   project_space_key: string,
 *   human_gates: Array<Record<string, unknown>>,
 * }} input
 * @returns {{
 *   project_space_key: string,
 *   gate_count: number,
 *   reopened_gate_count: number,
 *   human_gate_resume_audit_lines: string[],
 * }}
 */
export function buildHumanGateResumeAuditLines(input) {
  const key = input && input.project_space_key ? asString(input.project_space_key) : '';
  const gates = Array.isArray(input && input.human_gates) ? input.human_gates : [];

  let reopenedCount = 0;
  const lines = [];

  const scoped = key ? gates.filter((g) => g && asString(g.project_space_key) === key) : gates.slice();

  for (const g of scoped) {
    if (!g || typeof g !== 'object') continue;

    const id = shortId(g.id);
    const kindRaw = asString(g.gate_kind) || '-';
    const kind = stripSecretLike(kindRaw);

    const reopened = Number.isFinite(g.reopened_count)
      ? Math.max(0, Number(g.reopened_count))
      : 0;
    if (reopened > 0) reopenedCount += 1;

    const rtKind = asString(g.resume_target_kind);
    const rtRef = asString(g.resume_target_ref);
    const resume = rtKind && rtRef
      ? `resume=${stripSecretLike(rtKind)}/${stripSecretLike(rtRef)}`
      : '';

    const cont = deriveContinuationKey(g);
    const contSegment = cont && cont !== 'packet:-|run:-|thread:-' ? `cont=${cont}` : '';

    const segments = [
      `gate[${id}]`,
      `kind=${kind}`,
      `reopened=${reopened}`,
    ];
    if (resume) segments.push(resume);
    if (contSegment) segments.push(contSegment);

    const line = stripSecretLike(segments.join(' · '));
    lines.push(line);
    if (lines.length >= MAX_LINES) break;
  }

  return {
    project_space_key: key,
    gate_count: scoped.length,
    reopened_gate_count: reopenedCount,
    human_gate_resume_audit_lines: lines,
  };
}
