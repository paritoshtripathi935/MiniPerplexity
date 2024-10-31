import React, { useState } from 'react';
import { Brain } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { Answer } from './components/Answer';
import { fetchAnswer } from './services/api';
import type { Answer as AnswerType } from './types';

function App() {
  const [answer, setAnswer] = useState<AnswerType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setError(null);
    setAnswer({
      text: '',
      sources: [],
      loading: true
    });

    try {
      const response = await fetchAnswer(query);
      setAnswer({
        text: response.answer,
        sources: response.sources.map((source: any) => ({
          title: source.title,
          url: source.url,
          snippet: source.snippet
        })),
        loading: false
      });
    } catch (err) {
      setError('Failed to get answer. Please try again.');
      setAnswer(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Brain className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Mini Perplexity</h1>
            </div>
            <p className="text-gray-600 max-w-xl">
              Ask anything and get AI-powered answers with reliable sources
            </p>
          </div>

          <SearchBar 
            onSearch={handleSearch}
            loading={answer?.loading || false}
          />

          {error && (
            <div className="w-full max-w-3xl p-4 bg-red-50 border border-red-100 rounded-lg text-red-600">
              {error}
            </div>
          )}

          {answer && (
            <div className="w-full max-w-3xl">
              <Answer answer={answer} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;