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

interface ApplyAnswerArgs {
  messageId: string;
  answer: string;
  searchResults: any[];
  citations: string[];
  originatingQuery: string;
  originatingSearchResults: any[];
  originatingPlayId?: string;
  /** Server-side message id returned by /answer. The next-steps endpoint
   * uses this to attach suggestions to the right turn. */
  dbId?: string;
}

interface ApplyAnswerResult {
  update: (prev: Message[]) => Message[];
  messageId: string;
  fullContent: string;
}

/**
 * Wraps the message update for an arrived answer, normalising server fields
 * and seeding the reveal-animation state. Returned as a `(prev) => next`
 * updater so the caller can pass it directly into `setMessages` — keeps the
 * content swap batched with the searching flag flipping off.
 */
export function applyAssistantAnswer(args: ApplyAnswerArgs): ApplyAnswerResult {
  const updater = (prev: Message[]) =>
    prev.map(m =>
      m.id === args.messageId
        ? {
            ...m,
            dbId: args.dbId,
            content: args.answer,
            search_results: normaliseSearchResults(args.searchResults) ?? [],
            sources: args.citations.map((c: string) => ({
              title: '',
              url: c,
              type: 'web',
            })),
            isSearching: false,
            searchingUrls: undefined,
            revealedLength: 0,
            // Mark next-steps as in-flight only when we have a dbId to fetch
            // against — otherwise the chips would shimmer indefinitely.
            nextStepsLoading: !!args.dbId,
            originatingQuery: args.originatingQuery,
            originatingSearchResults: args.originatingSearchResults,
            originatingPlayId: args.originatingPlayId,
          }
        : m
    );
  return { update: updater, messageId: args.messageId, fullContent: args.answer };
}
