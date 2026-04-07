/**
 * External run status normalization + packet state authority (execution substrate only).
 */

/** @typedef {'non_terminal' | 'positive_terminal' | 'negative_terminal' | 'unknown'} ExternalStatusBucket */

/**
 * @param {string | null | undefined} raw
 * @returns {{ bucket: ExternalStatusBucket, canonical_label: string, raw_normalized: string }}
 */
export function canonicalizeExternalRunStatus(raw) {
  const raw_normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!raw_normalized) {
    return { bucket: 'unknown', canonical_label: 'empty', raw_normalized: '' };
  }

  const nonTerminal = new Set([
    'accepted',
    'pending',
    'queued',
    'running',
    'in_progress',
    'processing',
    'started',
    'active',
    'working',
    'busy',
  ]);
  const positive = new Set(['completed', 'succeeded', 'success', 'done', 'finished', 'complete']);
  const negative = new Set([
    'failed',
    'failure',
    'error',
    'errored',
    'cancelled',
    'canceled',
    'aborted',
    'timed_out',
    'timeout',
    'timed-out',
  ]);

  if (nonTerminal.has(raw_normalized)) {
    return { bucket: 'non_terminal', canonical_label: raw_normalized, raw_normalized };
  }
  if (positive.has(raw_normalized)) {
    return { bucket: 'positive_terminal', canonical_label: 'positive_terminal', raw_normalized };
  }
  if (negative.has(raw_normalized)) {
    return { bucket: 'negative_terminal', canonical_label: 'negative_terminal', raw_normalized };
  }
  return { bucket: 'unknown', canonical_label: raw_normalized, raw_normalized };
}

/**
 * @param {string} st
 */
export function isTerminalPacketState(st) {
  const s = String(st || '');
  return s === 'completed' || s === 'failed' || s === 'skipped';
}

/**
 * @param {string} st
 * @returns {'positive' | 'negative' | null}
 */
export function terminalPacketPolarity(st) {
  const s = String(st || '');
  if (s === 'failed') return 'negative';
  if (s === 'completed' || s === 'skipped') return 'positive';
  return null;
}

/**
 * @param {string} existingPacketState
 * @param {string} desiredPacketState
 * @param {string} incomingOccurredAt ISO
 * @param {{ occurred_at?: string, outcome?: string } | null | undefined} lastTerminalRec
 * @returns {{ state: string, skipPatch?: boolean, terminalRecord?: { occurred_at: string, outcome: 'positive' | 'negative' } | null }}
 */
export function resolveCursorPacketStateAuthority(
  existingPacketState,
  desiredPacketState,
  incomingOccurredAt,
  lastTerminalRec,
) {
  const existing = String(existingPacketState || 'queued');
  const desired = String(desiredPacketState || 'queued');
  const inT = Date.parse(String(incomingOccurredAt || '')) || 0;
  const lastT = lastTerminalRec && lastTerminalRec.occurred_at ? Date.parse(String(lastTerminalRec.occurred_at)) || 0 : 0;

  if (isTerminalPacketState(existing) && !isTerminalPacketState(desired)) {
    return { state: existing, skipPatch: true, terminalRecord: null };
  }

  if (!isTerminalPacketState(desired)) {
    return {
      state: desired,
      skipPatch: false,
      terminalRecord: null,
    };
  }

  const desiredOutcome = terminalPacketPolarity(desired);
  if (!isTerminalPacketState(existing)) {
    return {
      state: desired,
      skipPatch: false,
      terminalRecord:
        desiredOutcome != null
          ? { occurred_at: String(incomingOccurredAt || new Date().toISOString()), outcome: desiredOutcome }
          : null,
    };
  }

  const exP = terminalPacketPolarity(existing);
  const deP = terminalPacketPolarity(desired);
  if (exP && deP && exP === deP) {
    if (inT >= lastT) {
      return {
        state: desired,
        skipPatch: false,
        terminalRecord: { occurred_at: String(incomingOccurredAt || new Date().toISOString()), outcome: deP },
      };
    }
    return { state: existing, skipPatch: true, terminalRecord: null };
  }

  if (exP && deP && exP !== deP) {
    if (inT > lastT) {
      return {
        state: desired,
        skipPatch: false,
        terminalRecord: { occurred_at: String(incomingOccurredAt || new Date().toISOString()), outcome: deP },
      };
    }
    if (inT < lastT) {
      return { state: existing, skipPatch: true, terminalRecord: null };
    }
    return {
      state: 'failed',
      skipPatch: false,
      terminalRecord: {
        occurred_at: String(incomingOccurredAt || new Date().toISOString()),
        outcome: 'negative',
      },
    };
  }

  return {
    state: desired,
    skipPatch: false,
    terminalRecord:
      deP != null
        ? { occurred_at: String(incomingOccurredAt || new Date().toISOString()), outcome: deP }
        : null,
  };
}

/**
 * Map external bucket → COS packet state target.
 * @param {ExternalStatusBucket} bucket
 * @param {string} raw_normalized
 */
export function externalBucketToDesiredPacketState(bucket, raw_normalized) {
  if (bucket === 'positive_terminal') return 'completed';
  if (bucket === 'negative_terminal') return 'failed';
  if (bucket === 'non_terminal') {
    if (raw_normalized === 'queued' || raw_normalized === 'pending' || raw_normalized === 'accepted') return 'ready';
    return 'running';
  }
  return 'running';
}
