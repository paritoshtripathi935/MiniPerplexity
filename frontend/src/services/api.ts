// Add API host from environment variable
const API_HOST = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000';

export async function performSearch(
  query: string, 
  onProgress?: (url: string, status: string) => void
) {
  const response = await fetch(`${API_HOST}/api/v1/search`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Failed to perform search: ${response.status} ${response.statusText}`);
  }

  const searchResults = await response.json();
  
  // Simulate progress updates for each result
  if (onProgress) {
    for (const result of searchResults) {
      onProgress(result.url, 'Searching');
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
      // onProgress(result.url, 'Found content');
    }
  }

  return searchResults;
}

export async function getAnswer(query: string, sessionId: string, searchResults: any) {
  const response = await fetch(`${API_HOST}/api/v1/answer/${sessionId}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      query: query,
      search_results: searchResults
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
    const searchResults = await performSearch(query);
    console.log('searchResults', searchResults);
    const data = await getAnswer(query, sessionId, searchResults);
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}