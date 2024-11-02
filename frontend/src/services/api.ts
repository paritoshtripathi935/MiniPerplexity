// Add API host from environment variable
const API_HOST = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000';

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

export async function clearSession(sessionId: string) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function getSessionHistory(sessionId: string) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/history`);

  if (!response.ok) {
    throw new Error(`Failed to get session history: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}