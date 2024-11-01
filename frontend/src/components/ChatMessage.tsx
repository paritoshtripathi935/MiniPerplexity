import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink, User, Bot } from 'lucide-react';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  darkMode: boolean;
}

export function ChatMessage({ message, darkMode }: ChatMessageProps) {
  const isAssistant = message.type === 'assistant';
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping && currentIndex < message.content.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + message.content[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 10); // Adjust typing speed here

      return () => clearTimeout(timer);
    } else if (currentIndex >= message.content.length) {
      setIsTyping(false); // Stop typing when done
    }
  }, [currentIndex, isTyping, message.content]);

  const handleStopTyping = () => {
    setIsTyping(false);
  };

  return (
    <div className={`flex gap-4 ${isAssistant ? 'items-start' : 'items-start'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isAssistant 
          ? darkMode ? 'bg-blue-600' : 'bg-blue-100' 
          : darkMode ? 'bg-gray-700' : 'bg-gray-100'
      }`}>
        {isAssistant 
          ? <Bot className={darkMode ? 'text-white' : 'text-blue-600'} size={18} />
          : <User className={darkMode ? 'text-white' : 'text-gray-600'} size={18} />
        }
      </div>
      
      <div className="flex-1 space-y-4">
        <div className={`rounded-lg p-4 ${
          isAssistant
            ? darkMode ? 'bg-gray-800' : 'bg-white'
            : darkMode ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <ReactMarkdown className={`prose max-w-none ${
            darkMode ? 'prose-invert' : ''
          }`}>
            {displayedText}
          </ReactMarkdown>
          {isAssistant && (
            <div className="absolute bottom-4 right-4">
              {isTyping ? (
                <button
                  onClick={handleStopTyping}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                    darkMode
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-red-200 text-red-700 hover:bg-red-300'
                  }`}
                >
                  Stop Typing
                </button>
              ) : (
                <button
                  disabled
                  className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                    darkMode
                      ? 'bg-gray-700 text-gray-500'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  Completed
                </button>
              )}
            </div>
          )}
        </div>

        {isAssistant && message.sources && message.sources.length > 0 && (
          <div className={`rounded-lg p-4 ${
            darkMode ? 'bg-gray-800/50' : 'bg-gray-50'
          }`}>
            <h3 className="text-sm font-medium mb-2">Citations:</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {message.sources.map((source, index) => (
                <a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-2 p-2 rounded border ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 hover:border-blue-500'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="text-sm truncate">{source.url}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        
        {isAssistant && message.search_results && message.search_results.length > 0 && (
          <div className={`border-t p-4 ${
            darkMode ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <h3 className={`text-sm font-semibold mb-2 ${
              darkMode ? 'text-gray-100' : 'text-gray-900'
            }`}>Search Results:</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {message.search_results.map((result, index) => (
                <div key={index} className={`p-2 rounded-lg border ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                }`}>
                  <div className={`font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {result.title}
                  </div>
                  <a
                    href={result.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm text-blue-600 hover:underline`}
                  >
                    {result.type}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}