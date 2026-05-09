// Add API host from environment variable
const API_HOST = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000';

/**
 * `getToken` matches the signature returned by Clerk's `useAuth()` hook
 * (`@clerk/clerk-react`). When provided, every request gets an
 * `Authorization: Bearer <jwt>` header so the backend can identify the user.
 *
 * Pass `undefined` for guest/anonymous flows — the backend treats missing
 * tokens as anonymous, which matches the "Continue as guest" UX.
 */
export type GetToken = (() => Promise<string | null>) | null | undefined;

async function authHeaders(getToken: GetToken): Promise<Record<string, string>> {
  if (!getToken) return {};
  try {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Perform a search with the given query and session ID.
 */
export async function performSearch(
  query: string,
  sessionId: string,
  previousQueries: string[] = [],
  customUrl?: string,
  onProgress?: (url: string) => void,
  getToken?: GetToken
) {
  const queryParams = new URLSearchParams({ custom_url: customUrl || '' }).toString();
  const response = await fetch(`${API_HOST}/api/v1/search/${sessionId}?${queryParams}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify({
      query,
      previous_queries: previousQueries
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to perform search: ${response.status} ${response.statusText}`);
  }

  const searchResults = await response.json();

  if (onProgress && searchResults) {
    for (const result of searchResults) {
      onProgress(result.url);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return searchResults;
}

/**
 * Get an answer from the server based on the given query, search results, and previous queries.
 */
export async function getAnswer(
  query: string,
  sessionId: string,
  searchResults: any,
  previousQueries: string[] = [],
  getToken?: GetToken
) {
  const response = await fetch(`${API_HOST}/api/v1/answer/${sessionId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify({
      query: query,
      search_results: searchResults,
      previous_queries: previousQueries
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to get answer: ${errorData.detail || response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetches an answer for a given query and session ID.
 */
export async function fetchAnswer(query: string, sessionId: string, getToken?: GetToken) {
  try {
    const searchResults = await performSearch(query, sessionId, [], undefined, undefined, getToken);
    const data = await getAnswer(query, sessionId, searchResults, [], getToken);
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Deletes a user session.
 */
export async function clearSession(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders(getToken)) },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Gets the chat history for a session.
 */
export async function getSessionHistory(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/history`, {
    headers: { ...(await authHeaders(getToken)) },
  });

  if (!response.ok) {
    throw new Error(`Failed to get session history: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch the current user's profile. Requires a valid Clerk token.
 */
export async function getMe(getToken: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/me`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) {
    throw new Error(`Failed to load profile: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// ---------- History features (signed-in only) -----------------------------

export interface SessionListItem {
  id: string;
  title: string | null;
  created_at: string;
  last_accessed_at: string;
  is_archived: boolean;
  message_count: number;
  /** Short trimmed preview of the most recent message in the session. */
  last_message_excerpt: string | null;
}

export interface SearchHit {
  session_id: string;
  message_id: string;
  role: 'user' | 'assistant' | 'system';
  title: string | null;
  snippet: string;            // contains <mark>…</mark> highlights
  rank: number;
  matched_at: string;
  last_accessed_at: string;
}

export async function listSessions(
  getToken: GetToken,
  opts: { includeArchived?: boolean; limit?: number; offset?: number } = {}
): Promise<{ sessions: SessionListItem[] }> {
  const qp = new URLSearchParams();
  if (opts.includeArchived) qp.set('include_archived', 'true');
  if (opts.limit !== undefined) qp.set('limit', String(opts.limit));
  if (opts.offset !== undefined) qp.set('offset', String(opts.offset));
  const url = `${API_HOST}/api/v1/sessions${qp.toString() ? `?${qp}` : ''}`;
  const response = await fetch(url, { headers: { ...(await authHeaders(getToken)) } });
  if (!response.ok) throw new Error(`Failed to list sessions: ${response.status}`);
  return await response.json();
}

export async function patchSession(
  sessionId: string,
  payload: { title?: string; is_archived?: boolean },
  getToken: GetToken
) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to update session: ${response.status}`);
  return await response.json();
}

/**
 * Trigger a browser download of the session's markdown export.
 */
export async function downloadSessionExport(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/export`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to export session: ${response.status}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `miniperplexity-${sessionId}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function searchHistory(
  q: string,
  getToken: GetToken,
  limit: number = 20
): Promise<{ query: string; results: SearchHit[] }> {
  const qp = new URLSearchParams({ q, limit: String(limit) });
  const response = await fetch(`${API_HOST}/api/v1/search?${qp}`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to search: ${response.status}`);
  return await response.json();
}

// ---------- Brand profile (PaidPilot V1) ----------------------------------

export interface BrandProfile {
  user_id: string;
  company_name: string | null;
  website: string | null;
  icp_description: string | null;
  primary_channels: string[];
  target_cac: number | null;
  target_roas: number | null;
  voice_guidelines: string | null;
  current_campaigns_summary: string | null;
  onboarding_completed: boolean;
}

export type BrandProfileUpdate = Partial<Omit<BrandProfile, 'user_id' | 'onboarding_completed'>> & {
  mark_completed?: boolean;
};

export async function getBrandProfile(getToken: GetToken): Promise<BrandProfile> {
  const response = await fetch(`${API_HOST}/api/v1/brand-profile`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to load brand profile: ${response.status}`);
  return await response.json();
}

export async function putBrandProfile(
  payload: BrandProfileUpdate,
  getToken: GetToken
): Promise<BrandProfile> {
  const response = await fetch(`${API_HOST}/api/v1/brand-profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to save brand profile: ${response.status}`);
  return await response.json();
}

// ---------- Plays catalog -------------------------------------------------

export interface PlayInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Play {
  id: string;
  title: string;
  category: string;
  description: string;
  icon?: string;
  inputs: PlayInput[];
}

export async function listPlays(): Promise<{ plays: Play[] }> {
  const response = await fetch(`${API_HOST}/api/v1/plays`);
  if (!response.ok) throw new Error(`Failed to load plays: ${response.status}`);
  return await response.json();
}

/**
 * Run a Play: same as `getAnswer` but tags the request with `play_id` so
 * the backend layers the Play's instructions + output schema onto the
 * system prompt.
 */
export async function runPlay(
  playId: string,
  query: string,
  sessionId: string,
  searchResults: any,
  getToken?: GetToken
) {
  const qp = new URLSearchParams({ play_id: playId });
  const response = await fetch(`${API_HOST}/api/v1/answer/${sessionId}?${qp}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify({
      query,
      search_results: searchResults,
      previous_queries: [],
    }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Play failed: ${errorData.detail || response.statusText}`);
  }
  return await response.json();
}
