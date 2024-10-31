export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Answer {
  text: string;
  sources: Array<{
    title: string; // This can be kept if you plan to add titles later
    url: string;
    snippet?: string; // Optional, can be used if you add snippets in the future
  }>;
  loading: boolean;
  search_results?: Array<{
    source: string;
    type: string;
    title?: string;
  }>;
}
