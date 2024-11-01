export async function fetchAnswer(query: string, sessionId: string) {
  try {
    const response = await fetch(`https://miniperplexity.onrender.com/api/v1/answer/${sessionId}`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch answer: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
    throw error;
  }
}