/**
 * Monotonic attempt_seq per ops smoke_session_id (execution observability only; vNext.13.56).
 * Bumped once per cursor emit_patch/create_spec invoke when ops smoke + run id are active.
 */

/** @type {Map<string, number>} */
const lastSeqBySession = new Map();

/**
 * @param {string | null | undefined} smoke_session_id
 * @returns {number | null}
 */
export function bumpOpsSmokeAttemptSeq(smoke_session_id) {
  const sid = String(smoke_session_id || '').trim();
  if (!sid) return null;
  const next = (lastSeqBySession.get(sid) || 0) + 1;
  lastSeqBySession.set(sid, next);
  return next;
}

export function __resetOpsSmokeAttemptSeqForTests() {
  lastSeqBySession.clear();
}
