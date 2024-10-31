export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Answer {
  text: string;
  sources: SearchResult[];
  loading?: boolean;
}