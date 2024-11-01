import React, { useState, useEffect, useRef } from 'react';
import { Brain } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { ChatMessage } from './components/ChatMessage';
import { Message } from './types';
import { fetchAnswer } from './services/api';
import { v4 as uuidv4 } from 'uuid';
import { SignIn, SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import LoginPage from './components/LoginPage';
import DeveloperInfo from './components/DeveloperInfo';

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [sessionId] = useState<string>(uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [devInfoOpen, setDevInfoOpen] = useState<boolean>(false);
  const developerInfo = "Your developer info text goes here";
  const [typedText, setTypedText] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const loadingTimersRef = useRef<number[]>([]);
  const [showDevInfo, setShowDevInfo] = useState(false);

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
    <>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <div className={`min-h-screen ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <Brain className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'} brain-icon`} />
                <h1 className="text-2xl font-bold">Mini Perplexity</h1>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowDevInfo(!showDevInfo)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-100'
                      : 'bg-white hover:bg-gray-100 text-gray-800'
                  }`}
                >
                  Developer Info
                </button>
                <UserButton />
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`p-2 rounded-lg ${
                    darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
                  }`}
                >
                  {darkMode ? '🌞' : '🌙'}
                </button>
              </div>
            </div>

            {showDevInfo ? (
              <DeveloperInfo darkMode={darkMode} />
            ) : (
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
            )}

            <footer className={`fixed bottom-0 left-0 right-0 p-4 border-t ${
              darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
            }`}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <SearchBar 
                  onSearch={handleSearch}
                  loading={!!loadingState}
                />
              </div>
            </footer>
          </div>
        </div>
      </SignedIn>
    </>
  );
}

export default App;