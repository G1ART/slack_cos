/**
 * Fast-Track Status packet — legacy entry; 본체는 `statusPackets.js`.
 * @see src/features/statusPackets.js
 */

import { buildThinExecutiveStatusPacket, formatExecutiveStatusPacketSlack } from './statusPackets.js';

/** @deprecated 새 코드는 `statusPackets.js` 직접 사용 */
export function formatExecutiveStatusPacketV0(p) {
  const packet = buildThinExecutiveStatusPacket({
    intent: 'legacy_v0_stub',
    note: p?.note,
  });
  return formatExecutiveStatusPacketSlack(packet);
}
