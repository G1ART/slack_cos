/**
 * W12-E — SLACK_APP_MANIFEST.reference.json 의 scopes/events 가 INSTALL_NOTES.md 와 일치한다.
 *
 * 대상 집합:
 *  - bot_events (event_subscriptions.bot_events) ⊇ { app_mention, message.channels }
 *  - oauth_config.scopes.bot ⊇ { app_mentions:read, channels:history, chat:write }
 *  - INSTALL_NOTES.md 는 manifest 를 “참조” 하라고 지시하고 있어야 한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const beta = path.resolve(process.cwd(), 'docs/design-partner-beta');
const manifest = JSON.parse(
  fs.readFileSync(path.join(beta, 'SLACK_APP_MANIFEST.reference.json'), 'utf8'),
);
const install = fs.readFileSync(path.join(beta, 'INSTALL_NOTES.md'), 'utf8');

const botScopes = new Set(
  (manifest && manifest.oauth_config && manifest.oauth_config.scopes && manifest.oauth_config.scopes.bot) || [],
);
const botEvents = new Set(
  (manifest && manifest.settings && manifest.settings.event_subscriptions && manifest.settings.event_subscriptions.bot_events) || [],
);

for (const scope of ['app_mentions:read', 'channels:history', 'chat:write']) {
  assert.ok(botScopes.has(scope), `manifest bot scope missing: ${scope}`);
}
for (const ev of ['app_mention', 'message.channels']) {
  assert.ok(botEvents.has(ev), `manifest bot event missing: ${ev}`);
}
assert.ok(manifest.settings.socket_mode_enabled === true, 'socket mode must be enabled');
assert.match(install, /SLACK_APP_MANIFEST\.reference\.json/);

console.log('test-packaging-manifest-scope-consistency: ok');
