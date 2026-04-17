/**
 * W11-C — deriveContinuationKey 는 gate row 의 continuation_* 3축에서 결정적으로 파생한다.
 * 값(secret)을 포함하지 않고 식별자만, 없으면 '-' 로 치환. DB 에 저장하지 않음.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { deriveContinuationKey } = await import('../src/founder/humanGateRuntime.js');

assert.equal(
  deriveContinuationKey({
    continuation_packet_id: 'pkt_abc',
    continuation_run_id: 'run_xyz',
    continuation_thread_key: 'Tteam/Cchan/1.2',
  }),
  'packet:pkt_abc|run:run_xyz|thread:Tteam/Cchan/1.2',
);

// null 필드 → '-' 로 치환
assert.equal(
  deriveContinuationKey({
    continuation_packet_id: null,
    continuation_run_id: 'run_only',
    continuation_thread_key: null,
  }),
  'packet:-|run:run_only|thread:-',
);

// gate row 없음
assert.equal(deriveContinuationKey(null), 'packet:-|run:-|thread:-');
assert.equal(deriveContinuationKey(undefined), 'packet:-|run:-|thread:-');

// 결정적(deterministic): 같은 입력 → 같은 결과
const row = {
  continuation_packet_id: 'pkt_1',
  continuation_run_id: 'run_1',
  continuation_thread_key: 'thr_1',
};
assert.equal(deriveContinuationKey(row), deriveContinuationKey(row));

// helper 는 값(secret) 을 절대 포함하지 않음 — 입력에 토큰이 있어도 필드 자체만 조합
const noisy = {
  continuation_packet_id: 'pkt_noisy',
  continuation_run_id: 'run_noisy',
  continuation_thread_key: 'thr_noisy',
  resume_target_ref: 'ghp_verySecretToken_should_not_appear',
  gate_reason: 'sk-verysecret',
};
const derived = deriveContinuationKey(noisy);
assert.ok(!derived.includes('ghp_'), 'continuation_key must not include resume_target_ref');
assert.ok(!derived.includes('sk-'), 'continuation_key must not include unrelated secrets');

console.log('test-human-gate-continuation-key-derived: ok');
