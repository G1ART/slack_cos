/**
 * W11-A — Live binding capability registry (SSOT).
 *
 * 정본: docs/cursor-handoffs/W11_INTERNAL_ALPHA_QUALIFICATION_AND_LIVE_REHEARSAL_49f6924_2026-04-16.md §G11-A.
 *
 * Sink 별로 다음 truth 를 한 곳에 기록한다:
 *   - can_write:                    rest API 기반으로 write 가능한지
 *   - can_verify_existence:         write 후 존재 확인이 가능한지
 *   - can_read_back_value:          값 자체를 다시 읽을 수 있는지 (대부분 false — secret 은 일방향)
 *   - verification_modes_supported: 이 sink 가 실제로 지원하는 verification 수단 목록
 *   - requires_manual_confirmation: 수동 확인(human gate) 없이는 완결될 수 없는가
 *   - notes:                        운영자/감사자가 읽는 한 줄 설명
 *
 * Unknown sink 는 fail-closed 기본값(`can_write:false, requires_manual_confirmation:true`)을 돌려준다.
 * 이 파일은 값(secret)을 저장하지 않는다 — capability 사실만.
 */

/**
 * @typedef {Object} LiveBindingCapability
 * @property {boolean} can_write
 * @property {boolean} can_verify_existence
 * @property {boolean} can_read_back_value
 * @property {Array<'read_back'|'smoke'|'existence_only'|'none'>} verification_modes_supported
 * @property {boolean} requires_manual_confirmation
 * @property {string} notes
 */

/** @type {readonly string[]} */
export const VERIFICATION_MODES = Object.freeze(['read_back', 'smoke', 'existence_only', 'none']);

/** @type {Readonly<Record<string, LiveBindingCapability>>} */
const REGISTRY = Object.freeze({
  github: Object.freeze({
    can_write: true,
    can_verify_existence: true,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['existence_only', 'smoke', 'none']),
    requires_manual_confirmation: false,
    notes: 'GitHub Actions secrets API — write 후 existence check 가능, 값 read-back 불가',
  }),
  vercel: Object.freeze({
    can_write: true,
    can_verify_existence: true,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['existence_only', 'smoke', 'none']),
    requires_manual_confirmation: false,
    notes: 'Vercel Project Env API — write 후 existence check, 값 read-back 불가',
  }),
  railway: Object.freeze({
    can_write: true,
    can_verify_existence: true,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['existence_only', 'smoke', 'none']),
    requires_manual_confirmation: false,
    notes: 'Railway Project Variables API — write 후 existence check, 값 read-back 불가',
  }),
  supabase: Object.freeze({
    can_write: false,
    can_verify_existence: false,
    can_read_back_value: false,
    verification_modes_supported: Object.freeze(['smoke', 'none']),
    requires_manual_confirmation: true,
    notes: 'Supabase Management API 미보유 — smoke_only, 콘솔에서 수동 확인 필수',
  }),
});

/** Fail-closed 기본값 — unknown sink 조회 시 반환. */
const FAIL_CLOSED_DEFAULT = Object.freeze({
  can_write: false,
  can_verify_existence: false,
  can_read_back_value: false,
  verification_modes_supported: Object.freeze(['none']),
  requires_manual_confirmation: true,
  notes: 'unknown sink — fail-closed default (write 금지, 수동 확인 필요)',
});

/**
 * Sink 이름으로 capability row 를 돌려준다. 모르는 sink 는 fail-closed default.
 * @param {string} sink
 * @returns {LiveBindingCapability}
 */
export function getCapabilityForSink(sink) {
  const key = typeof sink === 'string' ? sink.trim().toLowerCase() : '';
  if (key && Object.prototype.hasOwnProperty.call(REGISTRY, key)) {
    return REGISTRY[key];
  }
  return FAIL_CLOSED_DEFAULT;
}

/**
 * 전체 registry snapshot (frozen, audit/테스트용).
 * @returns {Readonly<Record<string, LiveBindingCapability>>}
 */
export function listAllCapabilities() {
  return REGISTRY;
}

/**
 * plan/engine 이 쓰던 예전 `sinkCapabilities` shape 으로 변환 (후방호환).
 *   { supports_secret_write, supports_read_back }
 * @returns {Record<string, { supports_secret_write: boolean, supports_read_back: boolean }>}
 */
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

/**
 * Registry 가 지원한다고 선언한 verification mode 와 실제 step 의 verification_kind 가 호환되는지 검사.
 * 반환 true 면 그대로 사용 가능, false 면 호출측이 'none' + tool_adapter_unavailable 로 강등해야 한다.
 * @param {string} sink
 * @param {string} verificationKind
 */
export function isVerificationKindSupported(sink, verificationKind) {
  const cap = getCapabilityForSink(sink);
  const kind = typeof verificationKind === 'string' ? verificationKind : 'none';
  if (!cap.verification_modes_supported.includes(kind)) return false;
  return true;
}

/**
 * 지원하지 않는 verification_kind 를 감지했을 때 사용할 강등 결과.
 * @param {string} sink
 * @returns {{ verification_kind: 'none', failure_resolution_class: 'tool_adapter_unavailable' }}
 */
export function degradeUnsupportedVerification(_sink) {
  return Object.freeze({
    verification_kind: 'none',
    failure_resolution_class: 'tool_adapter_unavailable',
  });
}
