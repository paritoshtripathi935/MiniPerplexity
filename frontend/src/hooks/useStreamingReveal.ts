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
 */
export function useStreamingReveal(setMessages: SetMessages, resetKey?: string) {
  const handles = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      handles.current.forEach(h => window.clearInterval(h));
      handles.current.clear();
    };
  }, [resetKey]);

  return useCallback(
    (msgId: string, fullContent: string) => {
      const existing = handles.current.get(msgId);
      if (existing) window.clearInterval(existing);
      const handle = window.setInterval(() => {
        let done = false;
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== msgId) return m;
            const current = m.revealedLength ?? 0;
            const next = current + REVEAL_CHARS_PER_TICK;
            if (next >= fullContent.length) {
              done = true;
              return { ...m, revealedLength: undefined };
            }
            return { ...m, revealedLength: next };
          })
        );
        if (done) {
          window.clearInterval(handle);
          handles.current.delete(msgId);
        }
      }, REVEAL_TICK_MS);
      handles.current.set(msgId, handle);
    },
    [setMessages]
  );
}
