/**
 * Typed SWR wrappers over the API surface. Single source of truth for
 * client-side fetching + caching across pages and components.
 *
 * Pattern: each hook returns a `{ data, isLoading, mutate, error }` shape
 * (same as raw useSWR) but with the key and fetcher already wired so
 * callers don't accidentally diverge on key shape (which would defeat
 * the cache).
 *
 * Cache behaviour:
 *   - Stale-while-revalidate. Cached data renders synchronously; a
 *     background fetch updates it. UI snaps in on every visit after the
 *     first, then revalidates.
 *   - Dedup: concurrent mounts of the same key share one network call.
 *   - `revalidateOnFocus: false` — operator tools don't need the
 *     refetch-on-tab-focus dance; it just causes flicker. Manual mutate
 *     covers explicit invalidation (e.g. after Settings saves).
 *
 * Boot-time preload (`preloadQueries`) seeds the cache shortly after
 * first paint so every subsequent route nav lands on a cache hit.
 */
import useSWR, { useSWRConfig, type SWRConfiguration } from 'swr';
import {
  getBrandProfile,
  getMe,
  getPlaysHistory,
  getSessionHistory,
  listPlays,
  listSessions,
  type BrandProfile,
  type GetToken,
  type Play,
  type PlayHistoryItem,
  type SessionListItem,
  type UserProfile,
} from './api';

const SHARED: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateIfStale: true,
  // Operator-tool feel: serve cached, fetch in background, no toast on
  // transient failures (each page already has its own error UX).
  shouldRetryOnError: false,
};

/* ----------------------------- Cache keys ------------------------------ */
// Centralised so preload + mutate stay in sync with consumer hooks.
export const QK = {
  brandProfile: '/brand-profile' as const,
  me: '/me' as const,
  sessions: (opts: { includeArchived?: boolean; limit?: number } = {}) =>
    `/sessions?archived=${opts.includeArchived ? '1' : '0'}&limit=${opts.limit ?? 10}` as const,
  plays: '/plays' as const,
  playsHistory: '/plays/history' as const,
  sessionHistory: (sessionId: string) => `/session/${sessionId}/history` as const,
};

/* ----------------------------- Hooks ----------------------------------- */

export function useBrandProfile(getToken: GetToken, enabled = true) {
  return useSWR<BrandProfile | null>(
    enabled ? QK.brandProfile : null,
    () => getBrandProfile(getToken).catch(() => null),
    SHARED,
  );
}

export function useMe(getToken: GetToken, enabled = true) {
  return useSWR<UserProfile | null>(
    enabled ? QK.me : null,
    () => getMe(getToken).catch(() => null),
    SHARED,
  );
}

export function useSessions(
  getToken: GetToken,
  opts: { includeArchived?: boolean; limit?: number } = {},
  enabled = true,
) {
  return useSWR<SessionListItem[]>(
    enabled ? QK.sessions(opts) : null,
    () => listSessions(getToken, opts).then(r => r.sessions).catch(() => []),
    SHARED,
  );
}

export function usePlays(enabled = true) {
  return useSWR<Play[]>(
    enabled ? QK.plays : null,
    () => listPlays().then(r => r.plays).catch(() => []),
    SHARED,
  );
}

export function usePlaysHistory(getToken: GetToken, enabled = true) {
  return useSWR<PlayHistoryItem[]>(
    enabled ? QK.playsHistory : null,
    () => getPlaysHistory(getToken).then(r => r.items).catch(() => []),
    SHARED,
  );
}

/**
 * Per-session history. Keyed by sessionId so navigating between two
 * recently-viewed investigations hits the cache and shows instantly.
 * Returns the raw `{ history }` envelope so callers keep using the
 * existing shape.
 */
export function useSessionHistory(
  sessionId: string | null | undefined,
  getToken: GetToken,
  enabled = true,
) {
  return useSWR(
    enabled && sessionId ? QK.sessionHistory(sessionId) : null,
    () => getSessionHistory(sessionId!, getToken),
    SHARED,
  );
}

/* ----------------------------- Invalidation ---------------------------- */

/** Imperative cache helpers for non-hook contexts (App.tsx boot preload,
 * mutate-after-write flows in Settings, etc.). */
export function useCacheActions() {
  const { mutate } = useSWRConfig();
  return {
    /** Replace the brand-profile cache without refetching. Use after a
     * successful Settings save where we already have the new profile. */
    setBrandProfile: (next: BrandProfile) =>
      mutate(QK.brandProfile, next, { revalidate: false }),
    /** Bust the sessions list — next read refetches. Use after creating
     * or deleting an investigation. */
    invalidateSessions: () =>
      mutate(
        key => typeof key === 'string' && key.startsWith('/sessions?'),
      ),
    /** Bust a single session's history — use after Regenerate or
     * post-stream when the persisted turn count changes. */
    invalidateSessionHistory: (sessionId: string) =>
      mutate(QK.sessionHistory(sessionId)),
  };
}

/* ----------------------------- Boot preload ---------------------------- */

/**
 * Warm the SWR cache shortly after first paint. Called once from
 * App.tsx (gated on isSignedIn for the auth'd queries). Public queries
 * (plays) run unconditionally.
 *
 * Result: every subsequent route nav lands on a synchronous cache hit
 * for the queries that the destination page reads — no spinner, no
 * "frame appears then data" gap.
 */
export function preloadQueries(getToken: GetToken, isSignedIn: boolean) {
  // Fire-and-forget; SWR's internal cache catches the responses by key.
  // We're not consuming the returned promises — the next mount of the
  // matching useSWR call reads from cache.
  import('swr').then(({ mutate }) => {
    // Public catalog — always preload.
    mutate(QK.plays, listPlays().then(r => r.plays).catch(() => []), {
      revalidate: false,
    });
    if (!isSignedIn) return;
    mutate(
      QK.brandProfile,
      getBrandProfile(getToken).catch(() => null),
      { revalidate: false },
    );
    mutate(QK.me, getMe(getToken).catch(() => null), { revalidate: false });
    mutate(
      QK.sessions({ limit: 10 }),
      listSessions(getToken, { limit: 10 }).then(r => r.sessions).catch(() => []),
      { revalidate: false },
    );
    mutate(
      QK.playsHistory,
      getPlaysHistory(getToken).then(r => r.items).catch(() => []),
      { revalidate: false },
    );
  });
}
