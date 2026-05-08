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
