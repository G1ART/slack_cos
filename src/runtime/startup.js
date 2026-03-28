import { createRequire } from 'module';
import { validateEnv, formatEnvCheck, validateHostedStorageEnv } from './env.js';
import { collectHealthSnapshot, formatHealthSnapshot } from './health.js';

const require = createRequire(import.meta.url);

/**
 * Socket Mode / WebSocket 계열에서 일시 끊김이 나도 몇 번 재시도한다.
 * (Bolt 4 + @slack/socket-mode 2.x는 connecting 중 finity 예외를 크게 줄임)
 */
export async function startSlackAppWithRetry(slackApp, { attempts = 5, delayMs = 3000, logger = console } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await slackApp.start();
      return;
    } catch (err) {
      lastErr = err;
      logger.error(`[startup] slackApp.start 실패 (${i}/${attempts}):`, err?.message || err);
      if (i < attempts) {
        logger.log(`[startup] ${delayMs}ms 후 재시도...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

/** 미처리 Promise 거부 로깅 (디버깅용; 프로세스는 유지) */
export function attachUnhandledRejectionLogging({ logger = console } = {}) {
  process.on('unhandledRejection', (reason) => {
    logger.error('[process] unhandledRejection:', reason);
  });
}

/** 부팅 시 설치된 Slack SDK 버전을 한 줄로 남김(구버전 node_modules 진단용) */
export function logSlackSdkVersions({ logger = console } = {}) {
  try {
    const bolt = require('@slack/bolt/package.json').version;
    const sm = require('@slack/socket-mode/package.json').version;
    logger.log(`[startup] slack sdk: @slack/bolt@${bolt} @slack/socket-mode@${sm}`);
  } catch (e) {
    logger.warn('[startup] slack sdk 버전 확인 실패:', e?.message || e);
  }
}

/**
 * finity + "server explicit disconnect in connecting" 크래시는 socket-mode 1.x 전형.
 * Bolt 4는 peer로 2.x를 끌어오므로, 1.x가 남아 있으면 즉시 종료하고 재설치를 안내한다.
 */
export function assertSocketModeMajorAtLeast2({ logger = console } = {}) {
  let version;
  try {
    version = require('@slack/socket-mode/package.json').version;
  } catch (e) {
    logger.error('[fatal] @slack/socket-mode 패키지를 찾을 수 없습니다:', e?.message || e);
    process.exit(1);
  }
  const major = Number.parseInt(String(version).split('.')[0], 10);
  if (!Number.isFinite(major) || major < 2) {
    logger.error(
      [
        `[fatal] @slack/socket-mode@${version} 는 이 프로젝트(Bolt 4)와 호환되지 않습니다.`,
        '증상: finity StateMachine — Unhandled event \'server explicit disconnect\' in state \'connecting\'.',
        '조치: 프로젝트 루트에서 `rm -rf node_modules && npm install` 후 `npm ls @slack/socket-mode` 로 2.x 확인.',
      ].join('\n')
    );
    process.exit(1);
  }
}

export async function runStartupChecks({ model, logger = console }) {
  const env = validateEnv();
  logger.log(formatEnvCheck(env));
  if (!env.ok) {
    throw new Error(`Missing required environment variables: ${env.missing.join(', ')}`);
  }

  const hostedSt = validateHostedStorageEnv();
  if (!hostedSt.skipped && !hostedSt.ok) {
    throw new Error(
      `Hosted runtime requires Supabase env: ${hostedSt.missing.join(', ')} (see docs/cursor-handoffs/Phase_4_Hosted_Supabase_Promotion_handoff.md)`
    );
  }
  if (!hostedSt.skipped && hostedSt.ok) {
    logger.log(
      `[startup] hosted storage: supabase ok | STORAGE_MODE=${hostedSt.storage_mode_effective} | STORE_READ_PREFERENCE=${hostedSt.read_preference_effective}`
    );
  }

  const health = await collectHealthSnapshot({ model });
  logger.log(formatHealthSnapshot(health));
}

export function attachGracefulShutdown({ slackApp, logger = console, beforeStop } = {}) {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`[shutdown] received ${signal}`);
    try {
      if (typeof beforeStop === 'function') {
        await beforeStop();
      }
      await slackApp.stop();
      logger.log('[shutdown] slack app stopped');
    } catch (error) {
      logger.error('[shutdown] error:', error);
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

/**
 * 동기 예외가 터졌을 때 로그 후 종료.
 * (리스너를 달면 Node 기본 동작 대신 명시적으로 exit 하는 편이 안전함)
 */
export function attachUncaughtExceptionLogging({ logger = console, exitCode = 1 } = {}) {
  process.on('uncaughtException', (err) => {
    logger.error('[process] uncaughtException:', err);
    const msg = String(err?.message || err || '');
    if (msg.includes('server explicit disconnect') && msg.includes('connecting')) {
      let smVer = 'unknown';
      try {
        smVer = require('@slack/socket-mode/package.json').version;
      } catch {
        // ignore
      }
      logger.error(
        [
          '[hint] socket-mode connecting 단계 disconnect + finity 예외입니다.',
          `- 현재 설치된 @slack/socket-mode 버전: ${smVer}`,
          '- 1.x이면: `rm -rf node_modules && npm install` 후 2.x인지 확인하세요.',
          '- 스택에 `node_modules/finity`가 보이면 구 socket-mode 1.x 트리가 남아 있는 경우가 많습니다.',
        ].join('\n')
      );
    }
    process.exit(exitCode);
  });
}
