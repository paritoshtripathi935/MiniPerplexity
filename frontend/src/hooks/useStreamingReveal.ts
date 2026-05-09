import { useCallback, useEffect, useRef } from 'react';
import type { Message } from '../types';

/**
 * Tunables for the client-side streaming reveal. Real SSE will replace this
 * later — for now we accept the full answer and animate it in.
 *   CHARS_PER_TICK ≈ 30 chars × 20 ticks/sec → ~600 chars/s, which lands
 *   squarely between "feels too slow to read" and "snaps in instantly".
 */
const REVEAL_CHARS_PER_TICK = 30;
const REVEAL_TICK_MS = 50;

type SetMessages = React.Dispatch<React.SetStateAction<Message[]>>;

/**
 * Animate the assistant turn from the "_Thinking…_" placeholder to the full
 * answer. Owns a per-message interval map so concurrent reveals stay isolated;
 * cleans up automatically on unmount or when the supplied resetKey changes
 * (e.g. session change).
 *
 * Progress is tracked in a ref (not in message state) because React's
 * functional setters run during reconciliation — the stop decision has to
 * be synchronous within the interval tick, otherwise we can't reliably
 * clear the interval on the same tick that hits the end. Reading from
 * state would make "done" race with the queued updater and the interval
 * would loop the animation forever.
 */
export function useStreamingReveal(setMessages: SetMessages, resetKey?: string) {
  const handles = useRef<Map<string, number>>(new Map());
  const progress = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      handles.current.forEach(h => window.clearInterval(h));
      handles.current.clear();
      progress.current.clear();
    };
  }, [resetKey]);

  return useCallback(
    (msgId: string, fullContent: string) => {
      // Cancel any in-flight reveal for this message (e.g. Regenerate).
      const existing = handles.current.get(msgId);
      if (existing) window.clearInterval(existing);
      progress.current.set(msgId, 0);

      const handle = window.setInterval(() => {
        const current = progress.current.get(msgId) ?? 0;
        const next = current + REVEAL_CHARS_PER_TICK;

        if (next >= fullContent.length) {
          window.clearInterval(handle);
          handles.current.delete(msgId);
          progress.current.delete(msgId);
          setMessages(prev =>
            prev.map(m => (m.id === msgId ? { ...m, revealedLength: undefined } : m))
          );
          return;
        }

        progress.current.set(msgId, next);
        setMessages(prev =>
          prev.map(m => (m.id === msgId ? { ...m, revealedLength: next } : m))
        );
      }, REVEAL_TICK_MS);

      handles.current.set(msgId, handle);
    },
    [setMessages]
  );
}
