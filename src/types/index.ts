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