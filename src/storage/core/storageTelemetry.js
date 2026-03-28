/**
 * Structured storage observability (grep: store_read_ok | store_read_fallback | store_write)
 */

export function logStorageEvent(event, fields = {}) {
  const payload = {
    storage_telemetry: event,
    ts: new Date().toISOString(),
    ...fields,
  };
  try {
    console.info(JSON.stringify(payload));
  } catch {
    console.info('[storage]', event, fields);
  }
}
