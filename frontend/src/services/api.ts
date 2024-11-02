// Add API host from environment variable
const API_HOST = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000';

/**
 * Perform a search with the given query and session ID.
 * 
 * @param query The search query to perform
 * @param sessionId The session ID to associate the search with
 * @param previousQueries Previous queries in the session
 * @param onProgress Function to call when a search result is found, with the URL as argument
 * @returns A JSON object containing the search results
 * @throws An error if the search fails
 */
export async function performSearch(
  query: string,
  sessionId: string,
  previousQueries: string[] = [],
  onProgress?: (url: string) => void
) {
  const response = await fetch(`${API_HOST}/api/v1/search/${sessionId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
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
  
  if (onProgress) {
    for (const result of searchResults) {
      onProgress(result.url);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return searchResults;
}

/**
 * Get an answer from the server based on the given query, search results, and previous queries.
 * @param query The query to get an answer for
 * @param sessionId The session ID to associate the search with
 * @param searchResults The search results to generate an answer based on
 * @param previousQueries Previous queries in the session
 * @returns A JSON object containing the answer
 * @throws An error if the answer generation fails
 */
export async function getAnswer(
  query: string, 
  sessionId: string, 
  searchResults: any,
  previousQueries: string[] = []
) {
  const response = await fetch(`${API_HOST}/api/v1/answer/${sessionId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
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
   * Fetches an answer for a given query and session ID, by performing a search
   * and then generating an answer based on the search results.
   *
   * @param query The query to get an answer for
   * @param sessionId The session ID to associate the search with
   * @returns A JSON object containing the answer
   * @throws An error if the answer generation fails
   */
export async function fetchAnswer(query: string, sessionId: string) {
  try {
    const searchResults = await performSearch(query, sessionId);
    console.log('searchResults', searchResults);
    const data = await getAnswer(query, sessionId, searchResults);
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

  /**
   * Deletes a user session.
   *
   * @param sessionId The session ID to clear
   * @returns A JSON object indicating the session was cleared
   * @throws An error if the session ID is not found
   */
export async function clearSession(sessionId: string) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

  /**
   * Gets the chat history for a session.
   *
   * @param sessionId The session ID to retrieve the chat history for
   * @returns A JSON object containing the chat history for the session
   * @throws An error if the session ID is not found
   */
export async function getSessionHistory(sessionId: string) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/history`);

  if (!response.ok) {
    throw new Error(`Failed to get session history: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}