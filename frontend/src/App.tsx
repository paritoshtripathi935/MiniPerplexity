import React, { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { Answer } from './components/Answer';
import { fetchAnswer } from './services/api';
import type { Answer as AnswerType } from './types';
import './background-animation.css';
import { BackgroundText } from './components/BackgroundText';
import { SignIn, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

function App() {
  const [answer, setAnswer] = useState<AnswerType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const createParticle = () => {
      const particle = document.createElement('div');
      particle.className = `particle ${darkMode ? 'particle-dark' : 'particle-light'}`;
      
      // Random position
      particle.style.left = Math.random() * 100 + 'vw';
      particle.style.top = Math.random() * 100 + 'vh';
      
      // Random size between 2-6px
      const size = Math.random() * 4 + 2;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      
      // Random animation duration between 10-20s
      particle.style.animationDuration = `${Math.random() * 10 + 10}s`;
      
      document.getElementById('particle-container')?.appendChild(particle);
      
      // Remove particle after animation
      setTimeout(() => {
        particle.remove();
      }, 20000);
    };

    // Create new particles periodically
    const intervalId = setInterval(() => {
      createParticle();
    }, 2000);

    // Initial particles
    for (let i = 0; i < 20; i++) {
      createParticle();
    }

    return () => clearInterval(intervalId);
  }, [darkMode]);

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

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };
  
  return (
    <div className={`min-h-screen transition-colors duration-200 relative overflow-hidden ${
      darkMode 
        ? 'bg-gradient-to-b from-gray-900 to-gray-800 text-white' 
        : 'bg-gradient-to-b from-gray-50 to-white text-gray-900'
    }`}>
      <div id="particle-container" className="fixed inset-0 pointer-events-none" />
      <BackgroundText darkMode={darkMode} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="absolute top-4 right-4 flex items-center gap-4">
          <UserButton />
          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-lg ${
              darkMode 
                ? 'bg-gray-700 hover:bg-gray-800' 
                : 'bg-gray-200 hover:bg-gray-400'
            } transition-colors duration-200`}
          >
            {darkMode ? '🌞' : '🌙'}
          </button>
        </div>

        <div className="flex flex-col items-center gap-8">
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Brain className={`w-12 h-12 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <h1 className={`text-4xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-900'
              } tracking-tight`}>
                Mini Perplexity
              </h1>
            </div>
            <p className={`text-lg ${
              darkMode ? 'text-gray-300' : 'text-gray-600'
            } max-w-xl leading-relaxed`}>
              Ask anything and get AI-powered answers with reliable sources
            </p>
          </div>

          <SignedIn>
            <div className="w-full max-w-3xl backdrop-blur-lg bg-opacity-50 rounded-2xl p-6 shadow-lg border border-opacity-20 
              ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}">
              <SearchBar 
                onSearch={handleSearch}
                loading={answer?.loading || false}
              />
            </div>

            {loadingState && (
              <div className={`w-full max-w-3xl p-4 rounded-lg border ${
                darkMode 
                  ? 'bg-blue-900/30 border-blue-800 text-blue-300' 
                  : 'bg-blue-50 border-blue-100 text-blue-600'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 border-2 border-t-transparent rounded-full animate-spin ${
                    darkMode ? 'border-blue-400' : 'border-blue-500'
                  }`}></div>
                  <p>{loadingState}</p>
                </div>
              </div>
            )}

            {error && (
              <div className={`w-full max-w-3xl p-4 rounded-lg border ${
                darkMode 
                  ? 'bg-red-900/30 border-red-800 text-red-300' 
                  : 'bg-red-50 border-red-100 text-red-600'
              }`}>
                {error}
              </div>
            )}

            {answer && (
              <div className="w-full max-w-3xl">
                <Answer answer={answer} darkMode={darkMode} />
              </div>
            )}
          </SignedIn>

          <SignedOut>
            <div className={`w-full max-w-md p-6 rounded-lg ${
              darkMode ? 'bg-gray-800' : 'bg-white'
            } shadow-lg`}>
              <SignIn />
            </div>
          </SignedOut>
        </div>

        <footer className={`mt-16 text-center ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <p className="text-sm">
            Developed by {' '}
            <a 
              href="https://www.linkedin.com/in/a-paritoshtripathi/" 
              target="_blank" 
              rel="noopener noreferrer"
              className={`hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
            >
              Paritosh Tripathi
            </a>
            {' | '}
            <a 
              href="https://github.com/paritoshtripathi935" 
              target="_blank" 
              rel="noopener noreferrer"
              className={`hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
            >
              GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;