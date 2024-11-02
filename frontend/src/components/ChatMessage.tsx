import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink, Bot } from 'lucide-react';
import { useUser } from "@clerk/clerk-react";
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  darkMode: boolean;
}

export function ChatMessage({ message, darkMode }: ChatMessageProps) {
  const { user } = useUser();
  const isAssistant = message.type === 'assistant';
  const isSearching = message.isSearching;

  return (
    <div className={`rounded-lg ${
      darkMode ? 'bg-gray-800' : 'bg-white'
    }`}>
      <div className="p-4">
        {/* Message header */}
        <div className="flex items-center gap-2 mb-4">
          {isAssistant ? (
            <Bot className={`w-6 h-6 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          ) : (
            <img 
              src={user?.imageUrl} 
              alt={user?.fullName || 'User'} 
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {isAssistant ? 'Assistant' : user?.fullName || 'You'}
          </span>
          {isSearching && (
            <span className="animate-pulse text-blue-500 text-sm ml-2">
              Searching...
            </span>
          )}
        </div>

        {/* Message content */}
        <div className={`prose ${darkMode ? 'prose-invert' : ''}`}>
          <ReactMarkdown>
            {message.content}
          </ReactMarkdown>
        </div>
        {/* Search results and sources in a single section */}
        {isAssistant && ((message.search_results && message.search_results.length > 0) || (message.sources && message.sources.length > 0)) && (
          <div className={`mt-4 border-t ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <div className="pt-4 space-y-4">
              {/* Search Results */}
              {message.search_results && message.search_results.length > 0 && (
                <div>
                  <h3 className={`text-sm font-semibold mb-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Search Results
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {message.search_results.map((result, index) => (
                      <a
                        key={index}
                        href={result.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-2 rounded-lg border transition-colors ${
                          darkMode
                            ? 'bg-gray-700/50 border-gray-600 hover:border-blue-500'
                            : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className={`font-medium text-sm ${
                          darkMode ? 'text-gray-200' : 'text-gray-700'
                        }`}>
                          {result.title}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <ExternalLink className="w-3 h-3" />
                          <span className={`text-xs ${
                            darkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {result.type}
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Citations */}
              {message.sources && message.sources.length > 0 && (
                <div>
                  <h3 className={`text-sm font-semibold mb-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Sources
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {message.sources.map((source, index) => (
                      <a
                        key={index}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                          darkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate max-w-[200px]">
                          {source.url}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}