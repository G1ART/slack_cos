/**
 * Kernel Swap Verification Test.
 * Verifies the v1.1 pipeline is ACTUALLY wired as the front door in app.js,
 * council.js stays object-only shape, AI router does not synthesize Council text,
 * and outbound uses sendFounderResponse.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../../src');
const appPath = path.resolve(__dirname, '../../app.js');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) { passed++; }
  else { failed++; console.error(`FAIL: ${label}`); }
}

// --- 1. app.js wiring ---
{
  const appContent = await fs.readFile(appPath, 'utf8');
  assert('app_imports_pipeline', appContent.includes("import { founderRequestPipeline } from './src/core/founderRequestPipeline.js'"));
  assert('app_calls_pipeline', appContent.includes('founderRequestPipeline({'));
  assert('app_pipeline_before_command_router', (() => {
    const pipelineIdx = appContent.indexOf('founderRequestPipeline({');
    const commandIdx = appContent.indexOf('runInboundCommandRouter({');
    return pipelineIdx > 0 && commandIdx > 0 && pipelineIdx < commandIdx;
  })());
  assert(
    'app_returns_surface_type',
    appContent.includes('surface_type: pipelineResult.surface_type || pipelineResult.trace?.surface_type') ||
      appContent.includes('surface_type: pipelineResult.trace?.surface_type'),
  );
}

// --- 2. council.js object-only ---
{
  const councilContent = await fs.readFile(path.join(srcRoot, 'agents/council.js'), 'utf8');
  assert('council_no_text_report', !councilContent.includes('text: synthesis.report'));
  assert('council_has_deliberation', councilContent.includes('deliberation:'));
  assert('council_no_raw_report_builder', !councilContent.includes("let report = ''"));
}

// --- 3. runInboundAiRouter — Council synthesis path removed (deliberation prefix → partner_surface only) ---
{
  const aiRouterContent = await fs.readFile(path.join(srcRoot, 'features/runInboundAiRouter.js'), 'utf8');
  assert('ai_router_no_renderDeliberation_import', !aiRouterContent.includes('renderDeliberation'));
  assert('ai_router_no_runCouncilMode', !aiRouterContent.includes('runCouncilMode'));
  assert('ai_router_deliberation_prefix_removed', aiRouterContent.includes('deliberation_prefix_removed'));
  assert('ai_router_no_council_text', !aiRouterContent.includes('council.text'));
  assert('ai_router_no_legacy_lock_import', !aiRouterContent.includes("import { tryFinalizeInboundFounderRoutingLock }"));
}

// --- 4. registerHandlers uses sendFounderResponse ---
{
  const handlersContent = await fs.readFile(path.join(srcRoot, 'slack/registerHandlers.js'), 'utf8');
  assert('handlers_imports_sendFounderResponse', handlersContent.includes("import { sendFounderResponse }"));
  assert('handlers_no_replyInThread_import', !handlersContent.includes("import { replyInThread }"));
  assert('handlers_no_founderOutboundGate_import', !handlersContent.includes("from './founderOutboundGate.js'"));
  assert('handlers_uses_sendFounderResponse', (handlersContent.match(/sendFounderResponse\(/g) || []).length >= 5);
  assert('handlers_no_raw_postMessage', (() => {
    const lines = handlersContent.split('\n');
    const rawPosts = lines.filter(l =>
      l.includes('client.chat.postMessage') && !l.includes('postEphemeral')
    );
    return rawPosts.length === 0;
  })());
}

// --- 5. registerSlashCommands uses validateFounderText ---
{
  const slashContent = await fs.readFile(path.join(srcRoot, 'slack/registerSlashCommands.js'), 'utf8');
  assert('slash_imports_validateFounderText', slashContent.includes("import { validateFounderText }"));
  assert('slash_uses_safeText', slashContent.includes('safeText('));
  assert('slash_no_finalizeSlackResponse', !slashContent.includes("import { finalizeSlackResponse }"));
}

// --- 6. runInboundCommandRouter no legacy lock ---
{
  const cmdRouterContent = await fs.readFile(path.join(srcRoot, 'features/runInboundCommandRouter.js'), 'utf8');
  assert('cmd_router_no_legacy_lock_import', !cmdRouterContent.includes("import { tryFinalizeInboundFounderRoutingLock }"));
  assert('cmd_router_no_legacy_lock_call', !cmdRouterContent.includes('tryFinalizeInboundFounderRoutingLock('));
}

// --- 7. Core modules exist ---
{
  const coreFiles = [
    'core/founderContracts.js',
    'core/workObjectResolver.js',
    'core/workPhaseResolver.js',
    'core/policyEngine.js',
    'core/packetAssembler.js',
    'core/founderSurfaceRegistry.js',
    'core/founderRenderer.js',
    'core/founderOutbound.js',
    'core/founderRequestPipeline.js',
    'core/internalDeliberation.js',
  ];
  for (const f of coreFiles) {
    try {
      await fs.access(path.join(srcRoot, f));
      assert(`core_exists_${path.basename(f)}`, true);
    } catch {
      assert(`core_exists_${path.basename(f)}`, false);
    }
  }
}

// --- 8. founderAuthority.js deleted ---
{
  try {
    await fs.access(path.join(srcRoot, 'core/founderAuthority.js'));
    assert('founderAuthority_deleted', false);
  } catch {
    assert('founderAuthority_deleted', true);
  }
}

console.log(`\ntest-kernel-swap-verification: passed: ${passed} failed: ${failed}`);
if (failed > 0) process.exit(1);
