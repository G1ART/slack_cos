/**
 * Event-driven supervisor: callers register a listener; run store notifies after durable writes.
 * Avoids importing runSupervisor here (breaks cycles).
 *
 * Listener: (threadKey, runId?) — runId present when the durable write targeted a specific cos run uuid.
 */

/** @type {((threadKey: string, runId?: string | null) => void | Promise<void>) | null} */
let listener = null;

/**
 * @param {(threadKey: string, runId?: string | null) => void | Promise<void>} fn
 */
export function registerRunStateChangeListener(fn) {
  listener = typeof fn === 'function' ? fn : null;
}

/**
 * @param {string} threadKey
 */
export function notifyRunStateChanged(threadKey) {
  const tk = String(threadKey || '').trim();
  if (!tk || !listener) return;
  queueMicrotask(() => {
    try {
      const out = listener(tk, null);
      if (out && typeof out.then === 'function') out.catch((e) => console.error('[cos_run_notify]', e));
    } catch (e) {
      console.error('[cos_run_notify]', e);
    }
  });
}

/**
 * Prefer after external callbacks and other run-id–scoped writes so the supervisor ticks the exact run.
 * @param {string} threadKey
 * @param {string} runId
 */
export function notifyRunStateChangedForRun(threadKey, runId) {
  const tk = String(threadKey || '').trim();
  const rid = String(runId || '').trim();
  if (!tk || !rid || !listener) return;
  queueMicrotask(() => {
    try {
      const out = listener(tk, rid);
      if (out && typeof out.then === 'function') out.catch((e) => console.error('[cos_run_notify]', e));
    } catch (e) {
      console.error('[cos_run_notify]', e);
    }
  });
}
