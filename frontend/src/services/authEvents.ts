/**
 * Tiny event bus for "the backend just told us the bearer token isn't
 * valid". One place to emit; one place to subscribe.
 *
 * Why:
 *   - Clerk says the user is signed in (the JWT is in our local cookie
 *     store, not yet expired).
 *   - Backend rejects the request with 401 anyway — token signature
 *     verification failed, audience mismatch, user deleted in Clerk,
 *     JWKS cache miss, anything.
 *   - Result: components fall into "first-time user" branches because
 *     their hydration calls all failed with 401 and the `.catch` returned
 *     null. Real-world symptom: stuck on the onboarding wizard's step 1
 *     forever, with empty fields, no clear path to recover.
 *
 * The contract:
 *   - `notifyUnauthorized()` is called by every api.ts wrapper when a
 *     fetch returns 401 AND the request had an Authorization header
 *     (i.e. we tried to be authed, server said no).
 *   - `subscribeUnauthorized(cb)` is called once from `<AuthedShell>` —
 *     the callback fires `clerk.signOut()` and redirects to /sign-in.
 *
 * Implementation is a plain `Set<callback>` rather than `EventTarget` so
 * SSR / tests don't have to polyfill `window`. The handler set is global
 * to the module and never grows past 1-2 listeners in practice.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let lastFiredAt = 0;
// Coalesce rapid bursts — if 10 SWR queries fire on mount and they all
// 401 together, we only want one sign-out + one toast. 1500ms is enough
// to absorb a typical preloadQueries fan-out without delaying real
// later 401s by long enough for the user to notice.
const COALESCE_MS = 1500;

export function notifyUnauthorized(): void {
  const now = Date.now();
  if (now - lastFiredAt < COALESCE_MS) return;
  lastFiredAt = now;
  // Snapshot to defend against listeners that unsubscribe during iteration.
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch (e) {
      // Listener bugs must never break the next listener.
      // eslint-disable-next-line no-console
      console.error('authEvents listener threw:', e);
    }
  }
}

export function subscribeUnauthorized(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
