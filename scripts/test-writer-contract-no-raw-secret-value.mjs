/**
 * W13-A — Binding writer contract: `secret_value`/`value`/`token_value` 같은 raw secret key 를
 * WriterInput 으로 전달하면 **반드시 throw** 한다.
 */
import assert from 'node:assert/strict';

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;
const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;
const rw = (await import('../src/founder/toolPlane/lanes/railway/railwayBindingWriter.js')).default;
const sb = (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default;

const writers = [
  ['github', gh],
  ['vercel', vc],
  ['railway', rw],
  ['supabase', sb],
];

const forbidden = ['secret_value', 'value', 'secret', 'token_value'];

for (const [label, w] of writers) {
  for (const k of forbidden) {
    const req = {
      binding_name: 'KEY',
      sink_ref: 'anything',
      secret_handling_mode: 'write_only',
      [k]: 'super-duper',
    };
    let threw = false;
    try {
      await w.write(req, { env: {} });
    } catch (err) {
      threw = /raw/i.test(String(err && err.message)) || /reject/i.test(String(err && err.message));
    }
    assert.equal(threw, true, `${label}: writer must reject raw '${k}' in WriterInput`);
  }
}

console.log('test-writer-contract-no-raw-secret-value: ok');
