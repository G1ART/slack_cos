import assert from 'node:assert';
import {
  COS_SLACK_APP_ID_ENV,
  slackAppIdFromEnv,
} from '../src/founder/cosSlackAppIdentity.js';

const saved = process.env[COS_SLACK_APP_ID_ENV];
try {
  delete process.env[COS_SLACK_APP_ID_ENV];
  assert.equal(slackAppIdFromEnv(), '');

  process.env[COS_SLACK_APP_ID_ENV] = ' A01234BC ';
  assert.equal(slackAppIdFromEnv(), 'A01234BC');
} finally {
  if (saved === undefined) delete process.env[COS_SLACK_APP_ID_ENV];
  else process.env[COS_SLACK_APP_ID_ENV] = saved;
}

console.log('test-cos-slack-app-identity: ok');
