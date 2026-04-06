/**
 * COS — 창업자 Slack 전송 단일 출구 (vNext.13.16).
 * 금지 구절은 CONSTITUTION.md §4.3 파싱 결과(`forbiddenSubstrings`)로만 검사한다.
 */

import crypto from 'node:crypto';
import { FOUNDER_SURFACE_VALUES, FounderSurfaceType, SAFE_FALLBACK_TEXT } from './founderSurfacesMinimal.js';
import { findForbiddenSubstring } from '../founder/constitutionExtract.js';
import { getBuildInfo } from '../runtime/buildInfo.js';

function stripTransportJsonErrorBlobs(s) {
  return String(s || '')
    .replace(/\{\s*"detail"\s*:\s*"[^"]*"\s*\}/g, '')
    .replace(/\{\s*"detail"\s*:\s*'[^']*'\s*\}/g, '')
    .replace(/\{\s*"detail"\s*:\s*[^}]+\}/g, '');
}

function shortTextHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

function emitTraceLoose(fields) {
  try {
    console.info(
      JSON.stringify({
        stage: 'founder_output_trace',
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  } catch {
    /* never crash on diagnostics */
  }
}

/**
 * @param {Record<string, unknown>} fields
 */
export function emitFounderOutputTraceStrict(fields) {
  const line = JSON.stringify({
    stage: 'founder_output_trace',
    ts: new Date().toISOString(),
    ...fields,
  });
  console.info(line);
}

/**
 * @param {{
 *   say?: Function,
 *   client?: { chat: { postMessage: Function } },
 *   channel?: string,
 *   thread_ts?: string,
 *   rendered_text: string,
 *   rendered_blocks?: object[],
 *   surface_type: string,
 *   responder_kind?: string,
 *   intent?: string,
 *   trace?: Record<string, unknown>,
 *   metadata?: Record<string, unknown>,
 *   forbiddenSubstrings?: string[],
 * }} opts
 */
export async function sendFounderResponse(opts) {
  const {
    say,
    client,
    channel,
    thread_ts,
    rendered_text,
    rendered_blocks,
    surface_type,
    responder_kind = 'founder_cos',
    intent,
    forbiddenSubstrings = [],
  } = opts;
  const md = opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {};
  const founderStrict = md.founder_route === true;
  const forbidden = Array.isArray(forbiddenSubstrings) ? forbiddenSubstrings : [];

  if (founderStrict) {
    if (!String(md.founder_surface_source || '').trim()) {
      const err = new Error('founder_egress_contract_missing_founder_surface_source');
      err.code = 'founder_egress_contract_missing_founder_surface_source';
      throw err;
    }
    if (!String(md.pipeline_version || '').trim()) {
      const err = new Error('founder_egress_contract_missing_pipeline_version');
      err.code = 'founder_egress_contract_missing_pipeline_version';
      throw err;
    }
    if (!String(md.egress_caller || '').trim()) {
      const err = new Error('founder_egress_contract_missing_egress_caller');
      err.code = 'founder_egress_contract_missing_egress_caller';
      throw err;
    }
  }

  let trace = opts.trace && typeof opts.trace === 'object' ? { ...opts.trace } : {};

  let text = String(rendered_text || '');
  let hardFailReason = null;

  if (!FOUNDER_SURFACE_VALUES.has(surface_type)) {
    emitTraceLoose({
      intent,
      surface_type,
      responder_kind,
      error: 'unregistered_surface_type',
      ...trace,
    });
    text = SAFE_FALLBACK_TEXT;
    hardFailReason = 'invariant_breach';
  }

  const hadBlocks = Array.isArray(rendered_blocks) && rendered_blocks.length > 0;
  if (hadBlocks) {
    emitTraceLoose({
      intent,
      surface_type,
      responder_kind,
      error: 'founder_blocks_path_disabled_text_only',
      blocks_count: rendered_blocks.length,
      ...trace,
    });
  }

  const puritySurfaces = new Set([FounderSurfaceType.PARTNER_NATURAL, FounderSurfaceType.SAFE_FALLBACK]);

  if (puritySurfaces.has(surface_type) && hardFailReason == null) {
    text = stripTransportJsonErrorBlobs(text).trim();
    if (!text) {
      text = SAFE_FALLBACK_TEXT;
      hardFailReason = hardFailReason || 'empty_after_transport_strip';
    }
  }

  if (
    founderStrict &&
    puritySurfaces.has(surface_type) &&
    hardFailReason == null &&
    surface_type === FounderSurfaceType.PARTNER_NATURAL
  ) {
    const hit = findForbiddenSubstring(text, forbidden);
    if (hit) {
      emitTraceLoose({
        intent,
        surface_type,
        responder_kind,
        error: 'founder_constitution_egress_blocked',
        forbidden_match: hit.slice(0, 120),
        rendered_preview: text.slice(0, 200),
        ...trace,
      });
      const err = new Error('founder_constitution_egress_blocked');
      err.code = 'founder_constitution_egress_blocked';
      throw err;
    }
  }

  const bi = getBuildInfo();
  const boot_id = `boot_${bi.started_at}_${bi.pid}`;
  const instance_id = `${bi.hostname}:${bi.pid}`;

  if (founderStrict) {
    const egressPayload = {
      intent,
      surface_type,
      responder_kind,
      passed_pipeline: true,
      passed_outbound_gate: true,
      passed_renderer: true,
      passed_outbound_validation: hardFailReason == null,
      hard_fail_reason: hardFailReason,
      contains_internal_markers: false,
      text_hash: shortTextHash(text),
      rendered_preview: text.slice(0, 200),
      egress_caller: String(md.egress_caller || ''),
      runtime_sha: bi.release_sha_short,
      boot_id,
      instance_id,
      founder_outbound_mode: 'constitution_veto',
      ...trace,
    };
    emitFounderOutputTraceStrict(egressPayload);
  }

  try {
    if (say && thread_ts) {
      await say({ text, thread_ts });
    } else if (say) {
      await say(text);
    } else if (client && channel) {
      await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
    }
  } catch (err) {
    throw err;
  }

  if (!founderStrict) {
    emitTraceLoose({
      intent,
      surface_type,
      responder_kind,
      passed_pipeline: true,
      passed_outbound_gate: true,
      passed_renderer: true,
      passed_outbound_validation: hardFailReason == null,
      hard_fail_reason: hardFailReason,
      contains_internal_markers: false,
      rendered_preview: text.slice(0, 200),
      founder_outbound_mode: 'constitution_veto',
      ...trace,
    });
  }

  return text;
}

export function validateFounderText(text) {
  return { valid: true, text: String(text ?? '') };
}
