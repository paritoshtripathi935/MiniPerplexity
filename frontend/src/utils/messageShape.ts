import { v4 as uuidv4 } from 'uuid';
import type { Message, MessageSearchResult } from '../types';

/**
 * Convert backend search-result shape into the message-level shape the
 * ChatMessage component expects. Backend uses `{ title, url, source: <provider>, ... }`;
 * the frontend stores `{ title, source: <url>, type: <provider>, ... }` for
 * legacy reasons.
 */
export function normaliseSearchResults(
  results: any[] | undefined | null,
): MessageSearchResult[] | undefined {
  if (!results || !Array.isArray(results)) return undefined;
  return results.map(r => ({
    title: r.title ?? '',
    source: r.url ?? r.source ?? '',
    type: r.source ?? r.type ?? 'web',
    snippet: r.snippet,
    _authoritative: !!r._authoritative,
    _authority: r._authority,
  }));
}

interface ServerHistoryMessage {
  id?: string;
  role: string;
  content: string;
  search_results?: any[];
  next_steps?: { items?: string[] } | null;
  latency_ms?: number | null;
}

/**
 * Convert the server's history payload into client-side Message[]. Each
 * assistant turn carries the search_results that grounded it (server joins
 * messages → query → search_results → tags via source_ranker), the db id
 * (so the client can call /messages/:id/next-steps later), and any cached
 * next-step suggestions.
 */
export function rehydrateMessages(history: ServerHistoryMessage[]): Message[] {
  return history.map(h => {
    if (h.role === 'assistant') {
      const cachedSteps = h.next_steps?.items;
      return {
        id: uuidv4(),
        dbId: h.id,
        type: 'assistant',
        content: h.content,
        timestamp: new Date(),
        search_results: normaliseSearchResults(h.search_results),
        nextSteps:
          Array.isArray(cachedSteps) && cachedSteps.length > 0 ? cachedSteps : undefined,
        latencyMs: typeof h.latency_ms === 'number' ? h.latency_ms : undefined,
      };
    }
    return {
      id: uuidv4(),
      type: 'user',
      content: h.content,
      timestamp: new Date(),
    };
  });
}

