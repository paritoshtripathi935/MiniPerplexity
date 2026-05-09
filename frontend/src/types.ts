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
  /** Client-side React key. Stable for the lifetime of the message in the UI. */
  id: string;
  /** Server-side database id of the persisted assistant message. Used to call
   * `/messages/:id/next-steps` and to attach future operations to the right
   * turn. Only present on assistant turns that have been persisted. */
  dbId?: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: {
    url: string;
    title: string;
    type: string;
  }[];
  search_results?: MessageSearchResult[];
  /** LLM-generated follow-up suggestions for this turn (cached server-side
   * after first generation). Up to 3 short questions a marketer would
   * naturally ask next. Driven by /messages/:id/next-steps. */
  nextSteps?: string[];
  /** When true, the next-steps fetch is in flight — the UI shows shimmer
   * placeholders for the chips. */
  nextStepsLoading?: boolean;
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
