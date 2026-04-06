/** vNext.13.16 founder-only 배포 경로용 최소 surface 집합 (레거거 contracts 미사용). */

export const FounderSurfaceType = Object.freeze({
  PARTNER_NATURAL: 'partner_natural_surface',
  SAFE_FALLBACK: 'safe_fallback_surface',
  EXCEPTION: 'exception_surface',
});

export const FOUNDER_SURFACE_VALUES = new Set(Object.values(FounderSurfaceType));

export const SAFE_FALLBACK_TEXT = '잠시 후 다시 시도해 주세요.';
