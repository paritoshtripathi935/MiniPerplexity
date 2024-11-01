export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Answer {
  text: string;
  sources: Source[];
  loading: boolean;
}

export interface ApiResponse {
  answer: string;
  sources: {
    title: string;
    url: string;
    snippet: string;
  }[];
}

export interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: { title: string; url: string; type: string }[];
  search_results?: { title: string; source: string; type: string }[];
}