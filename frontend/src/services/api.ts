export async function fetchAnswer(query: string) {
  try {
    const response = await fetch('https://miniperplexity.onrender.com/api/v1/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch answer: ${response.status} ${response.statusText}`);
    }
    
    console.log(`Response status: ${response.status}`);

    return await response.json();
  } catch (error) {
    console.error('Error fetching answer:', error);
    throw error;
  }
}