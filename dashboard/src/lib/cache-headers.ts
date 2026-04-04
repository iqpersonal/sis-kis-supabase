/**
 * Shared Cache-Control header presets for API routes.
 * Used to reduce Firestore reads via HTTP caching.
 */

/** Static/rarely-changing data (academic years, class lists, departments) — cache 24h */
export const CACHE_LONG = { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600" };

/** Semi-static data (catalog, bundles, transcript settings, staff) — cache 1h */
export const CACHE_MEDIUM = { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600" };

/** Dynamic data (attendance, fees, notifications, sales) — cache 5 min */
export const CACHE_SHORT = { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60" };

/** User/session-specific data (parent portal, teacher portal) — private cache 5 min */
export const CACHE_PRIVATE = { "Cache-Control": "private, max-age=300" };

/** No caching (real-time sync status, POST responses) */
export const CACHE_NONE = { "Cache-Control": "no-store" };
