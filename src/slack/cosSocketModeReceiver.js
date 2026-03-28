/**
 * Bolt 기본 SocketModeReceiver + @slack/socket-mode 의 pong 대기시간 완화.
 * flaky 네트워크·VPN에서 기본 5000ms 는 [WARN] pong timeout 이 잦을 수 있음.
 *
 * 환경 변수 (선택):
 * - `SLACK_SOCKET_CLIENT_PING_TIMEOUT_MS` — 클라이언트 ping 후 pong 대기 (기본 15000)
 * - `SLACK_SOCKET_SERVER_PING_TIMEOUT_MS` — 서버 ping 대기 (기본 30000, SDK 와 동일)
 */
import { SocketModeClient } from '@slack/socket-mode';
import BoltSmrMod from '@slack/bolt/dist/receivers/SocketModeReceiver.js';
import SocketModeAckMod from '@slack/bolt/dist/receivers/SocketModeResponseAck.js';
import * as SocketModeFunctions from '@slack/bolt/dist/receivers/SocketModeFunctions.js';

const BaseSocketModeReceiver = BoltSmrMod.default ?? BoltSmrMod;
const SocketModeResponseAck = SocketModeAckMod.default ?? SocketModeAckMod;
const { defaultProcessEventErrorHandler } = SocketModeFunctions;

function readPingMs(envKey, fallback) {
  const raw = process.env[envKey];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 5000 ? n : fallback;
}

export class CosSocketModeReceiver extends BaseSocketModeReceiver {
  /**
   * @param {ConstructorParameters<typeof BaseSocketModeReceiver>[0]} options
   */
  constructor(options) {
    super(options);

    const clientPingTimeout = readPingMs(
      'SLACK_SOCKET_CLIENT_PING_TIMEOUT_MS',
      15000
    );
    const serverPingTimeout = readPingMs(
      'SLACK_SOCKET_SERVER_PING_TIMEOUT_MS',
      30000
    );

    const {
      appToken,
      logger,
      logLevel,
      installerOptions = {},
      customPropertiesExtractor = () => ({}),
      processEventErrorHandler = defaultProcessEventErrorHandler,
    } = options;

    const oldClient = this.client;
    oldClient.removeAllListeners();
    try {
      oldClient.disconnect();
    } catch {
      /* pre-start */
    }

    this.client = new SocketModeClient({
      appToken,
      logLevel,
      logger: logger ?? this.logger,
      clientOptions: installerOptions.clientOptions,
      clientPingTimeout,
      serverPingTimeout,
    });

    this.client.on('slack_event', async (args) => {
      const { body, retry_num, retry_reason } = args;
      const ack = new SocketModeResponseAck({
        logger: this.logger,
        socketModeClientAck: args.ack,
      });
      const event = {
        body,
        ack: ack.bind(),
        retryNum: retry_num,
        retryReason: retry_reason,
        customProperties: customPropertiesExtractor(args),
      };
      try {
        await this.app?.processEvent(event);
      } catch (error) {
        const shouldBeAcked = await processEventErrorHandler({
          error,
          logger: this.logger,
          event,
        });
        if (shouldBeAcked) {
          await event.ack();
        }
      }
    });

    if (process.env.SLACK_SOCKET_PING_LOG === '1') {
      this.logger.info(
        `[socket-mode] clientPingTimeout=${clientPingTimeout}ms serverPingTimeout=${serverPingTimeout}ms`
      );
    }
  }
}

export default CosSocketModeReceiver;
