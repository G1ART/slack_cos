/**
 * Event-driven supervisor: callers register a listener; run store notifies after durable writes.
 * Avoids importing runSupervisor here (breaks cycles).
 */

/** @type {((threadKey: string) => void | Promise<void>) | null} */
let listener = null;

/**
 * @param {(threadKey: string) => void | Promise<void>} fn
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
      const out = listener(tk);
      if (out && typeof out.then === 'function') out.catch((e) => console.error('[cos_run_notify]', e));
    } catch (e) {
      console.error('[cos_run_notify]', e);
    }
  });
}
