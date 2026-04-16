/**
 * W8-C — writer 입력에 raw secret value 류 키가 들어오면 즉시 throw.
 */
import assert from 'node:assert/strict';

const writers = [
  (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default,
  (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default,
  (await import('../src/founder/toolPlane/lanes/railway/railwayBindingWriter.js')).default,
  (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default,
];

const banned = ['secret_value', 'value', 'secret', 'token_value'];

for (const w of writers) {
  for (const b of banned) {
    const req = {
      project_space_key: 'ps',
      binding_requirement_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'any',
      secret_handling_mode: 'write_only',
      binding_name: 'X',
      [b]: 'sk-live-1234',
    };
    await assert.rejects(() => w.write(req, { env: {} }), /must not carry raw/);
  }
}

console.log('test-live-binding-writers-reject-secret-value: ok');
