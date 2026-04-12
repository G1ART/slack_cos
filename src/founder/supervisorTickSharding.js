/**
 * 단일 프로세스 내 슈퍼바이저 tick 재진입 방지 키.
 * 택배사무소 병렬 원칙: 전역 단일 락이 아니라 run 단위(`r:`)·스레드 단위(`t:`)로 샤딩.
 */

/** @param {string} runId */
export function supervisorTickInflightKeyForRun(runId) {
  return `r:${String(runId || '').trim()}`;
}

/** @param {string} threadKey */
export function supervisorTickInflightKeyForThread(threadKey) {
  return `t:${String(threadKey || '').trim()}`;
}
