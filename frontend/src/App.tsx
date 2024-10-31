import React, { useState } from 'react';
import { Brain } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { Answer } from './components/Answer';
import { fetchAnswer } from './services/api';
import type { Answer as AnswerType } from './types';

function App() {
  const [answer, setAnswer] = useState<AnswerType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query: string) => {
    setError(null);
    setAnswer({
      text: '',
      sources: [],
      loading: true,
      search_results: []
    });

    // Set up loading state timeout
    const timeout = setTimeout(() => {
      setLoadingState('Searching the web...');
      
      // Sequence of loading messages
      setTimeout(() => {
        setLoadingState('Processing search results...');
      }, 2000);
      
      setTimeout(() => {
        setLoadingState('Generating AI response...');
      }, 4000);
    }, 500);

    setLoadingTimeout(timeout);
  
    try {
      const response = await fetchAnswer(query);
      console.log("API Response:", response);
      
      // Clear loading state and timeout
      setLoadingState(null);
      if (loadingTimeout) clearTimeout(loadingTimeout);
  
      if (response && response.answer && Array.isArray(response.citations)) {
        setAnswer({
          text: response.answer,
          sources: response.citations.map((citation: string) => ({
            title: '',
            url: citation,
            snippet: ''
          })),
          loading: false,
          search_results: response.search_results.map((result: any) => ({
            source: result.url,
            type: result.type,
            title: result.title
          }))
        });
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to fetch answer: ${err}`);
      setAnswer(null);
      setLoadingState(null);
      if (loadingTimeout) clearTimeout(loadingTimeout);
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

          {loadingState && (
            <div className="w-full max-w-3xl p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-blue-600">{loadingState}</p>
              </div>
            </div>
          )}

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