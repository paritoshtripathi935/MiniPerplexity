export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Answer {
  text: string;
  sources: Array<{
    title: string;
    url: string;
    snippet?: string;
  }>;
  loading: boolean;
  search_results?: Array<{
    source: string;
    type: string;
    title?: string;
  }>;
}

/**
 * Per-result entry stored on a message. `source` is the URL (legacy field
 * name preserved for back-compat with the existing renderer); `type` carries
 * the provider label ("youtube", "google", "bing"). The `_authoritative`
 * tag is set by the backend's source_ranker for high-authority marketing
 * domains, and drives the "✓ Authoritative" badge in the source strip.
 */
export interface MessageSearchResult {
  source: string;
  type: string;
  title: string;
  snippet?: string;
  _authoritative?: boolean;
  _authority?: number;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: {
    url: string;
    title: string;
    type: string;
  }[];
  search_results?: MessageSearchResult[];
  /**
   * True while the assistant turn is still resolving (search → answer).
   * Drives the inline "Searching" indicator.
   */
  isSearching?: boolean;
  /**
   * URLs surfaced as the search step progresses — rendered as a structured
   * "fetching" list while `isSearching`. Distinct from `content` so the live
   * search trace doesn't bleed into the final markdown answer.
   */
  searchingUrls?: string[];
  /**
   * Number of characters of `content` that have been revealed so far during
   * the client-side streaming animation. `undefined` = render all of `content`
   * (covers historical/rehydrated messages and live messages while searching).
   */
  revealedLength?: number;
  /**
   * Inputs that produced this assistant turn — kept around so the user
   * can hit "Regenerate" without re-running the search step. Only
   * populated on assistant messages.
   */
  originatingQuery?: string;
  originatingSearchResults?: any[];
  originatingPlayId?: string;
}
