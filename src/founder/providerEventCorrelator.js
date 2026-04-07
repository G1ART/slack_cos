/**
 * Record external object ↔ run correlation after successful adapter calls.
 */

import { getActiveRunForThread } from './executionRunStore.js';
import { upsertExternalCorrelation } from './correlationStore.js';
import { appendCosRunEvent } from './runCosEvents.js';

/**
 * @param {{
 *   threadKey: string,
 *   packetId?: string,
 *   action: string,
 *   apiData: Record<string, unknown>,
 * }} ctx
 */
export async function recordGithubInvocationCorrelation(ctx) {
  const threadKey = String(ctx.threadKey || '').trim();
  if (!threadKey) return false;
  const run = await getActiveRunForThread(threadKey);
  if (!run?.id) return false;
  const data = ctx.apiData && typeof ctx.apiData === 'object' ? ctx.apiData : {};
  const number = data.number;
  if (number == null) return false;
  const action = String(ctx.action || '');
  const object_type = action === 'open_pr' ? 'pull_request' : 'issue';
  const object_id = String(number);
  const packetId = ctx.packetId != null ? String(ctx.packetId).trim() : '';

  const ok = await upsertExternalCorrelation({
    run_id: String(run.id),
    thread_key: threadKey,
    packet_id: packetId || null,
    provider: 'github',
    object_type,
    object_id,
  });
  if (!ok) return false;

  await appendCosRunEvent(threadKey, 'tool_invoked', {
    tool: 'github',
    action,
    object_type,
    object_id,
    correlation_registered: true,
  });
  return true;
}
