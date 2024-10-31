export async function fetchAnswer(query: string) {
  try {
    const response = await fetch('https://paritosh.tripathi.mini/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch answer');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching answer:', error);
    throw error;
  }
}