import React, { useState, useEffect, useRef } from 'react';
import { Brain } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { ChatMessage } from './components/ChatMessage';
import { Message } from './types';
import { fetchAnswer } from './services/api';
import { v4 as uuidv4 } from 'uuid';
import { SignIn, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [sessionId] = useState<string>(uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [devInfoOpen, setDevInfoOpen] = useState<boolean>(false);
  const [typedText, setTypedText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const loadingTimersRef = useRef<number[]>([]);
  const developerInfo = " Developed by Paritosh Tripathi";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (devInfoOpen) {
      setTypedText('');
      setIsTyping(true);
      let index = 0;

      const typingInterval = setInterval(() => {
        if (index < developerInfo.length) {
          setTypedText(prev => prev + developerInfo[index]);
          index++;
        } else {
          clearInterval(typingInterval);
          setIsTyping(false);
        }
      }, 100); // Adjust typing speed here

      return () => clearInterval(typingInterval);
    }
  }, [devInfoOpen]);

  // Cleanup function to clear all timers
  const clearLoadingTimers = () => {
    loadingTimersRef.current.forEach(timer => window.clearTimeout(timer));
    loadingTimersRef.current = [];
    setLoadingState(null);
  };

  // Reset function for new search
  const resetSearch = () => {
    clearLoadingTimers();
    setError(null);
  };

  const handleSearch = async (query: string) => {
    resetSearch();

    const userMessage: Message = {
      id: uuidv4(),
      type: 'user',
      content: query,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);

    // Set up loading state sequence
    const loadingStates = [
      { message: 'Performing Google Search...', delay: 0 },
      { message: 'Performing Bing Search...', delay: 1000 },
      { message: 'Generating AI Results...', delay: 2000 },
      { message: 'Thinking...', delay: 3000 }
    ];

    // Create and store loading state timers
    loadingStates.forEach(({ message, delay }) => {
      const timer = window.setTimeout(() => {
        setLoadingState(message);
      }, delay);
      loadingTimersRef.current.push(timer);
    });

    try {
      const response = await fetchAnswer(query, sessionId);
      
      // Clear all loading states immediately when response arrives
      clearLoadingTimers();

      if (response && response.answer && Array.isArray(response.citations)) {
        const assistantMessage: Message = {
          id: uuidv4(),
          type: 'assistant',
          content: response.answer,
          timestamp: new Date(),
          sources: response.citations.map((citation: string) => ({
            title: '',
            url: citation,
            type: 'web'
          })),
          search_results: response.search_results
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      setError(`Failed to fetch answer: ${err}`);
      clearLoadingTimers(); // Clear loading states on error
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLoadingTimers();
    };
  }, []);
  ;

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      darkMode 
        ? 'bg-gradient-to-b from-gray-900 to-gray-800 text-white' 
        : 'bg-gradient-to-b from-gray-50 to-white text-gray-900'
    }`}>
      <header className={`p-4 border-b shadow-sm fixed w-full top-0 z-10 backdrop-blur-lg bg-opacity-80 ${
        darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <h1 className="text-xl font-bold text-center flex-grow">Mini Perplexity AI</h1>
          <div className="flex items-center gap-4">
            <UserButton />
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {darkMode ? '🌞' : '🌙'}
            </button>
            <button
              onClick={() => setDevInfoOpen(!devInfoOpen)}
              className={`p-2 rounded-lg ${
                darkMode 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {devInfoOpen ? '🔒' : 'ℹ️'}
            </button>
            {devInfoOpen && (
              <div 
                className={`fixed inset-0 z-30 flex items-center justify-center backdrop-blur-md`}
                onClick={() => setDevInfoOpen(false)}
              >
                <div 
                  className={`p-4 rounded-lg shadow-lg ${
                    darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
                  } w-[400px] h-[400px] flex flex-col items-center justify-center`}
                >
                  <p className="text-center">{typedText}</p>
                  <div className="flex justify-center gap-4 mt-2">
                    <a href="https://www.linkedin.com/in/a-paritoshtripathi/" target="_blank" rel="noopener noreferrer">
                      <img src="Linkedin logo.svg" alt="LinkedIn" className="w-8 h-8" />
                    </a>
                    <a href="https://github.com/paritoshtripathi935" target="_blank" rel="noopener noreferrer">
                      <img src="/path/to/github-icon.svg" alt="GitHub" className="w-8 h-8" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 pt-24 pb-32">
        <SignedIn>
          <div className="space-y-6">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                darkMode={darkMode}
              />
            ))}
            
            {loadingState && (
              <div className={`p-4 rounded-lg ${
                darkMode 
                  ? 'bg-gray-800 text-gray-300' 
                  : 'bg-white text-gray-600'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"></div>
                  <p>{loadingState}</p>
                </div>
              </div>
            )}

            {error && (
              <div className={`p-4 rounded-lg ${
                darkMode 
                  ? 'bg-red-900/30 text-red-300' 
                  : 'bg-red-50 text-red-600'
              }`}>
                {error}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </SignedIn>

        <SignedOut>
          <div className={`w-full max-w-md mx-auto p-6 rounded-lg ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          } shadow-lg`}>
            <SignIn />
          </div>
        </SignedOut>
      </main>

      <footer className={`fixed bottom-0 left-0 right-0 p-4 border-t ${
        darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <div className="max-w-7xl mx-auto">
          <SearchBar 
            onSearch={handleSearch}
            loading={!!loadingState}
          />
        </div>
      </footer>
    </div>
  );
}

export default App;