/**
 * W11-A + W12-A — Live binding capability registry (SSOT).
 *
 * W11-A 정본: docs/cursor-handoffs/W11_INTERNAL_ALPHA_QUALIFICATION_AND_LIVE_REHEARSAL_49f6924_2026-04-16.md §G11-A.
 * W12-A 정본: docs/cursor-handoffs/W12_LIVE_QUALIFICATION_AND_PACKAGING_PLANMODE_MASTER_INSTRUCTION_2026-04-16.md §3 Slice A.
 *
 * Sink 별로 다음 truth 를 한 곳에 기록한다:
 *   - can_write, can_verify_existence, can_read_back_value
 *   - verification_modes_supported, requires_manual_confirmation
 *   - required_human_action, notes
 *   - (W12-A) qualification_status, last_verified_at, last_verified_mode,
 *     verified_by, verification_notes, evidence_ref, stale_after_days
 *
 * qualification_status 는 default 로 'conservative' — 아직 검증되지 않은 가정.
 * ops/live_binding_capability_qualifications.json 원장이 있으면 병합되어
 * 'live_verified' / 'fixture_verified' / 'verification_failed' / 'stale' 로 변할 수 있다.
 *
 * 이 파일과 원장 모두 값(secret) 을 저장하지 않는다 — capability 사실만.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {Object} LiveBindingCapability
 * @property {boolean} can_write
 * @property {boolean} can_verify_existence
 * @property {boolean} can_read_back_value
 * @property {Array<'read_back'|'smoke'|'existence_only'|'none'>} verification_modes_supported
 * @property {boolean} requires_manual_confirmation
 * @property {string|null} required_human_action
 * @property {string} notes
 * @property {'live_verified'|'fixture_verified'|'conservative'|'unverified'|'stale'|'verification_failed'|'manual_only'} qualification_status
 * @property {string|null} last_verified_at
 * @property {'live'|'fixture'|null} last_verified_mode
 * @property {string|null} verified_by
 * @property {string|null} verification_notes
 * @property {string|null} evidence_ref
 * @property {number} stale_after_days
 * @property {boolean} [write_only_write_back_forbidden]
 * @property {string|null} [known_limitation]
 */

/** @type {readonly string[]} */
export const VERIFICATION_MODES = Object.freeze(['read_back', 'smoke', 'existence_only', 'none']);

/** @type {readonly string[]} */
export const QUALIFICATION_STATUSES = Object.freeze([
  'live_verified',
  'live_verified_read_only',
  'fixture_verified',
  'conservative',
  'unverified',
  'stale',
  'verification_failed',
  'manual_only',
]);

const DEFAULT_STALE_AFTER_DAYS = 30;

/** @type {Readonly<Record<string, LiveBindingCapability>>} */
const REGISTRY = Object.freeze({
  github: Object.freeze({
    can_write: true,
    can_verify_existence: true,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['existence_only', 'smoke', 'none']),
    requires_manual_confirmation: false,
    required_human_action: null,
    notes: 'GitHub Actions secrets API — libsodium encrypt + PUT write, 존재 확인만 가능, 값 read-back 불가',
    qualification_status: 'conservative',
    last_verified_at: null,
    last_verified_mode: null,
    verified_by: null,
    verification_notes: null,
    evidence_ref: null,
    stale_after_days: DEFAULT_STALE_AFTER_DAYS,
    write_only_write_back_forbidden: true,
    known_limitation: null,
  }),
  vercel: Object.freeze({
    can_write: true,
    can_verify_existence: true,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['existence_only', 'smoke', 'none']),
    requires_manual_confirmation: false,
    required_human_action: null,
    notes: 'Vercel Project Env API — POST/PATCH write, 존재 확인 가능, 값 read-back 불가, 적용은 다음 deploy 부터',
    qualification_status: 'conservative',
    last_verified_at: null,
    last_verified_mode: null,
    verified_by: null,
    verification_notes: null,
    evidence_ref: null,
    stale_after_days: DEFAULT_STALE_AFTER_DAYS,
    write_only_write_back_forbidden: true,
    known_limitation: 'requires_redeploy_to_apply',
  }),
  railway: Object.freeze({
    can_write: false,
    can_verify_existence: false,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['smoke', 'none']),
    requires_manual_confirmation: true,
    required_human_action: 'Railway 대시보드에서 프로젝트 변수를 수동 설정',
    notes: 'Railway — 본 에픽에서는 live write 미구현, 운영자 수동 설정으로만 처리',
    qualification_status: 'manual_only',
    last_verified_at: null,
    last_verified_mode: null,
    verified_by: null,
    verification_notes: null,
    evidence_ref: null,
    stale_after_days: DEFAULT_STALE_AFTER_DAYS,
    write_only_write_back_forbidden: true,
    known_limitation: 'no_official_public_api_variable_write_in_this_epic',
  }),
  supabase: Object.freeze({
    can_write: false,
    can_verify_existence: false,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['smoke', 'none']),
    requires_manual_confirmation: true,
    required_human_action: 'Supabase 콘솔에서 프로젝트 설정·서비스 키 발급을 수동 확인',
    notes: 'Supabase Management API — probe 전용, write 미구현',
    qualification_status: 'conservative',
    last_verified_at: null,
    last_verified_mode: null,
    verified_by: null,
    verification_notes: null,
    evidence_ref: null,
    stale_after_days: DEFAULT_STALE_AFTER_DAYS,
    write_only_write_back_forbidden: true,
    known_limitation: 'management_api_probe_only',
  }),
});

/** Fail-closed 기본값 — unknown sink 조회 시 반환. */
const FAIL_CLOSED_DEFAULT = Object.freeze({
  can_write: false,
  can_verify_existence: false,
  can_read_back_value: false,
  verification_modes_supported: Object.freeze(['none']),
  requires_manual_confirmation: true,
  required_human_action: '알 수 없는 sink — 운영자 확인 필요',
  notes: 'unknown sink — fail-closed default (write 금지, 수동 확인 필요)',
  qualification_status: 'unverified',
  last_verified_at: null,
  last_verified_mode: null,
  verified_by: null,
  verification_notes: null,
  evidence_ref: null,
  stale_after_days: DEFAULT_STALE_AFTER_DAYS,
  write_only_write_back_forbidden: true,
  known_limitation: 'unknown_sink',
});

export function getCapabilityForSink(sink) {
  const key = typeof sink === 'string' ? sink.trim().toLowerCase() : '';
  if (key && Object.prototype.hasOwnProperty.call(REGISTRY, key)) {
    return REGISTRY[key];
  }
  return FAIL_CLOSED_DEFAULT;
}

export function listAllCapabilities() {
  return REGISTRY;
}

export function deriveLegacySinkCapabilities() {
  /** @type {Record<string, { supports_secret_write: boolean, supports_read_back: boolean }>} */
  const out = {};
  for (const [sink, cap] of Object.entries(REGISTRY)) {
    out[sink] = {
      supports_secret_write: cap.can_write === true,
      supports_read_back: cap.can_read_back_value === true,
    };
  }
  return Object.freeze(out);
}

export function isVerificationKindSupported(sink, verificationKind) {
  const cap = getCapabilityForSink(sink);
  const kind = typeof verificationKind === 'string' ? verificationKind : 'none';
  if (!cap.verification_modes_supported.includes(kind)) return false;
  return true;
}

export function degradeUnsupportedVerification(_sink) {
  return Object.freeze({
    verification_kind: 'none',
    failure_resolution_class: 'tool_adapter_unavailable',
  });
}

// ============================================================================
// W12-A — qualification ledger merge + live-write gate
// ============================================================================

export const DEFAULT_QUALIFICATION_LEDGER_PATH = 'ops/live_binding_capability_qualifications.json';

function safeReadLedger(ledgerPath) {
  if (!ledgerPath) return null;
  try {
    const abs = path.isAbsolute(ledgerPath) ? ledgerPath : path.resolve(process.cwd(), ledgerPath);
    if (!fs.existsSync(abs)) return null;
    const raw = fs.readFileSync(abs, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_e) {
    return null;
  }
}

function parseIsoDate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : null;
}

function isStaleByDate(lastVerifiedAt, staleAfterDays, nowIso) {
  if (!lastVerifiedAt) return false;
  const last = parseIsoDate(lastVerifiedAt);
  if (!last) return false;
  const now = nowIso ? parseIsoDate(nowIso) : new Date();
  if (!now) return false;
  const diffDays = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > Math.max(1, Number(staleAfterDays) || DEFAULT_STALE_AFTER_DAYS);
}

/**
 * Static registry + ops ledger 병합본을 돌려준다.
 * @param {string} sink
 * @param {{ ledgerPath?: string | null, ledger?: object | null, nowIso?: string }} [opts]
 * @returns {LiveBindingCapability}
 */
export function getQualifiedCapabilityForSink(sink, opts = {}) {
  const baseCap = getCapabilityForSink(sink);
  const normalizedSink =
    typeof sink === 'string' ? sink.trim().toLowerCase() : '';
  const ledger =
    opts && opts.ledger && typeof opts.ledger === 'object'
      ? opts.ledger
      : safeReadLedger(
          opts && Object.prototype.hasOwnProperty.call(opts, 'ledgerPath')
            ? opts.ledgerPath
            : DEFAULT_QUALIFICATION_LEDGER_PATH,
        );
  let merged = { ...baseCap };
  merged.verification_modes_supported = baseCap.verification_modes_supported.slice();

  if (ledger && ledger.sinks && typeof ledger.sinks === 'object' && normalizedSink) {
    const entry = ledger.sinks[normalizedSink];
    if (entry && typeof entry === 'object') {
      if (QUALIFICATION_STATUSES.includes(entry.qualification_status)) {
        merged.qualification_status = entry.qualification_status;
      }
      if (typeof entry.last_verified_at === 'string' || entry.last_verified_at === null) {
        merged.last_verified_at = entry.last_verified_at || null;
      }
      if (entry.last_verified_mode === 'live' || entry.last_verified_mode === 'fixture' || entry.last_verified_mode === null) {
        merged.last_verified_mode = entry.last_verified_mode || null;
      }
      if (typeof entry.verified_by === 'string' || entry.verified_by === null) {
        merged.verified_by = entry.verified_by || null;
      }
      if (typeof entry.verification_notes === 'string' || entry.verification_notes === null) {
        merged.verification_notes = entry.verification_notes || null;
      }
      if (typeof entry.evidence_ref === 'string' || entry.evidence_ref === null) {
        merged.evidence_ref = entry.evidence_ref || null;
      }
    }
  }

  if (
    (merged.qualification_status === 'live_verified' || merged.qualification_status === 'fixture_verified') &&
    isStaleByDate(merged.last_verified_at, merged.stale_after_days, opts.nowIso)
  ) {
    merged.qualification_status = 'stale';
  }

  return Object.freeze(merged);
}

/**
 * live write (실제 provider API 호출) 를 허용할지. `live_verified` 만 true.
 * @param {LiveBindingCapability} cap
 */
export function isLiveWriteAllowed(cap) {
  if (!cap || typeof cap !== 'object') return false;
  if (cap.can_write !== true) return false;
  return cap.qualification_status === 'live_verified';
}

/**
 * 현재 qualification_status 에서 허용되는 최대 verification mode.
 *   live_verified / conservative → registry 가 지원하는 첫 번째 mode (read_back > existence_only > smoke > none)
 *                                  (conservative 는 artifact 미존재 기본값 — verification_kind 는 legacy 로 유지하되
 *                                   engine 단에서 live write 만 보수적으로 차단한다)
 *   fixture_verified             → 'smoke' 이하
 *   stale / unverified / verification_failed → 'none' (fail-closed)
 * @param {LiveBindingCapability} cap
 * @returns {'read_back'|'smoke'|'existence_only'|'none'}
 */
export function maxAllowedVerificationKind(cap) {
  if (!cap || typeof cap !== 'object') return 'none';
  const supported = Array.isArray(cap.verification_modes_supported)
    ? cap.verification_modes_supported
    : ['none'];
  if (cap.qualification_status === 'live_verified' || cap.qualification_status === 'conservative') {
    const priority = ['read_back', 'existence_only', 'smoke', 'none'];
    for (const mode of priority) {
      if (supported.includes(mode)) return mode;
    }
    return 'none';
  }
  if (cap.qualification_status === 'fixture_verified') {
    if (supported.includes('smoke')) return 'smoke';
    return 'none';
  }
  return 'none';
}

/**
 * 알려진 모든 sink 키 리스트 (CLI --all 지원용).
 * @returns {string[]}
 */
export function listKnownSinks() {
  return Object.keys(REGISTRY).sort();
}
