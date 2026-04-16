/**
 * Founder COS — single-turn input block for Responses API.
 */

/**
 * @param {{
 *   recentTurns: { role: string, text: string, attachments?: object[] }[],
 *   userText: string,
 *   attachmentResults: { filename: string, ok: boolean, summary?: string, reason?: string }[],
 *   metadata: Record<string, unknown>,
 *   executionSummaryLines?: string[],
 *   adapterReadinessLines?: string[],
 *   proactiveSurfaceLines?: string[],
 * }} p
 */
export function buildFounderConversationInput(p) {
  const lines = [];
  const proactiveLines = Array.isArray(p.proactiveSurfaceLines) ? p.proactiveSurfaceLines.filter(Boolean) : [];
  if (proactiveLines.length) {
    for (const line of proactiveLines) lines.push(line);
    lines.push('');
  }
  lines.push('[최근 대화]');
  const rt = p.recentTurns || [];
  if (!rt.length) lines.push('(이전 턴 없음)');
  else {
    for (const t of rt) {
      const prefix = t.role === 'assistant' ? 'assistant' : 'user';
      lines.push(`${prefix}: ${String(t.text || '').slice(0, 8000)}`);
      if (t.attachments?.length) {
        lines.push(`  [그 턴 첨부] ${JSON.stringify(t.attachments).slice(0, 2000)}`);
      }
    }
  }
  lines.push('');
  lines.push('[현재 턴]');
  lines.push(`user: ${String(p.userText || '').trim()}`);
  const attLines = [];
  for (const r of p.attachmentResults || []) {
    const fn = String(r.filename || '첨부');
    if (r.ok && r.summary) attLines.push(`- ${fn}: ${String(r.summary).slice(0, 8000)}`);
    else attLines.push(`- ${fn}: (읽기 실패) ${String(r.reason || '').slice(0, 500)}`);
  }
  lines.push(attLines.length ? 'attachments:\n' + attLines.join('\n') : 'attachments: (없음)');
  lines.push('');
  lines.push('[최근 실행 아티팩트]');
  const sl = p.executionSummaryLines || [];
  if (!sl.length) lines.push('(없음)');
  else {
    for (const line of sl) lines.push(line);
  }
  const ar = p.adapterReadinessLines;
  if (ar && ar.length) {
    lines.push('');
    lines.push('[Adapter readiness — COS 내부만, founder 응답에 인용 금지]');
    for (const line of ar.slice(0, 6)) lines.push(line);
  }
  lines.push('');
  lines.push('[최소 메타 — 앱은 의미 분류하지 않음]');
  lines.push(
    JSON.stringify({
      channel: p.metadata?.channel,
      user: p.metadata?.user,
      ts: p.metadata?.ts,
      thread_ts: p.metadata?.thread_ts,
      channel_type: p.metadata?.channel_type,
    }),
  );
  return lines.join('\n');
}
