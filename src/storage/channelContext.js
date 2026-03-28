import { CHANNELS_FILE } from './paths.js';
import { readJsonObject, writeJsonObject } from './jsonStore.js';

export async function readChannelContextMap() {
  return readJsonObject(CHANNELS_FILE, {});
}

export async function writeChannelContextMap(map) {
  await writeJsonObject(CHANNELS_FILE, map || {});
}

export async function getChannelContext(channelId) {
  if (!channelId) return null;
  const map = await readChannelContextMap();
  return map[channelId] || null;
}

export async function setChannelContext(channelId, value) {
  const map = await readChannelContextMap();
  map[channelId] = value;
  await writeChannelContextMap(map);
}

export async function clearChannelContext(channelId) {
  const map = await readChannelContextMap();
  delete map[channelId];
  await writeChannelContextMap(map);
}

