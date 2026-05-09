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

/**
 * Convert the server's history payload into client-side Message[]. Each
 * assistant turn carries the search_results that grounded it (server joins
 * messages → query → search_results → tags via source_ranker).
 */
export function rehydrateMessages(
  history: { role: string; content: string; search_results?: any[] }[],
): Message[] {
  return history.map(h => {
    if (h.role === 'assistant') {
      return {
        id: uuidv4(),
        type: 'assistant',
        content: h.content,
        timestamp: new Date(),
        search_results: normaliseSearchResults(h.search_results),
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
            originatingQuery: args.originatingQuery,
            originatingSearchResults: args.originatingSearchResults,
            originatingPlayId: args.originatingPlayId,
          }
        : m
    );
  return { update: updater, messageId: args.messageId, fullContent: args.answer };
}
