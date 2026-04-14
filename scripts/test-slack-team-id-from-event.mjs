import assert from 'node:assert/strict';
import { slackTeamIdFromEvent } from '../src/founder/slackEventTenancy.js';

assert.equal(slackTeamIdFromEvent({}), '');
assert.equal(slackTeamIdFromEvent({ team: ' T0ABC ' }), 'T0ABC');
assert.equal(slackTeamIdFromEvent({ team_id: 'T0XYZ' }), 'T0XYZ');
assert.equal(slackTeamIdFromEvent({ team: 'T1', team_id: 'T0' }), 'T1');

console.log('test-slack-team-id-from-event: ok');
