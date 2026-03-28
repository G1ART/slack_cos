import fs from 'fs';
import path from 'path';

const processedEvents = new Map();
const EVENT_TTL_MS = 10 * 60 * 1000;
const SHARED_MAX_KEYS = 8000;

export function cleanupProcessedEvents() {
  const now = Date.now();
  for (const [key, ts] of processedEvents.entries()) {
    if (now - ts > EVENT_TTL_MS) {
      processedEvents.delete(key);
    }
  }
}

export function getEventKey(body, event) {
  if (body?.event_id) return `event_id:${body.event_id}`;
  return `fallback:${event?.channel || 'unknown'}:${event?.ts || 'no-ts'}:${event?.user || 'no-user'}:${event?.text || ''}`;
}

function dedupDisabled() {
  const v = process.env.SLACK_EVENT_DEDUP_DISABLE;
  return v === '1' || String(v).toLowerCase() === 'true';
}

/**
 * @param {string} filePath
 * @param {string} key
 */
function shouldSkipEventSharedFile(filePath, key) {
  const now = Date.now();
  const abs = path.resolve(filePath);
  let map = {};
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    if (raw.trim()) map = JSON.parse(raw);
  } catch {
    map = {};
  }
  if (typeof map !== 'object' || map === null) map = {};

  for (const k of Object.keys(map)) {
    const ts = Number(map[k]);
    if (!Number.isFinite(ts) || now - ts > EVENT_TTL_MS) delete map[k];
  }

  if (map[key] != null && now - Number(map[key]) < EVENT_TTL_MS) {
    return true;
  }

  map[key] = now;
  const keys = Object.keys(map);
  if (keys.length > SHARED_MAX_KEYS) {
    keys.sort((a, b) => Number(map[a]) - Number(map[b]));
    const overflow = keys.length - SHARED_MAX_KEYS;
    for (let i = 0; i < overflow; i += 1) delete map[keys[i]];
  }

  try {
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify(map);
    const tmp = path.join(dir, `.slack-event-dedup.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, payload, 'utf8');
    try {
      fs.renameSync(tmp, abs);
    } catch {
      fs.copyFileSync(tmp, abs);
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('[slack_event_dedup] shared file write failed', err?.message || err);
  }
  return false;
}

export function shouldSkipEvent(body, event) {
  if (dedupDisabled()) return false;

  const key = getEventKey(body, event);
  const sharedPath = process.env.SLACK_EVENT_DEDUP_FILE
    ? String(process.env.SLACK_EVENT_DEDUP_FILE).trim()
    : '';

  if (sharedPath) {
    return shouldSkipEventSharedFile(sharedPath, key);
  }

  cleanupProcessedEvents();
  if (processedEvents.has(key)) return true;
  processedEvents.set(key, Date.now());
  return false;
}
