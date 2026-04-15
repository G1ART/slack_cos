import { AsyncLocalStorage } from 'node:async_hooks';

/** @type {AsyncLocalStorage<Record<string, unknown>>} */
const als = new AsyncLocalStorage();

/**
 * @template T
 * @param {Record<string, unknown>} scope
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function runWithRequestScope(scope, fn) {
  const base = scope && typeof scope === 'object' && !Array.isArray(scope) ? scope : {};
  return als.run(base, fn);
}

/**
 * @returns {Record<string, unknown>}
 */
export function getRequestScope() {
  return als.getStore() || {};
}
