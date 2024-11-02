import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink, Bot, Youtube, Search } from 'lucide-react';
import { useUser } from "@clerk/clerk-react";
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
  darkMode: boolean;
}

/**
 * Renders a chat message component with user or assistant information.
 *
 * @param {ChatMessageProps} props - The properties for the chat message.
 * @param {Message} props.message - The message object containing content and metadata.
 * @param {boolean} props.darkMode - A flag indicating if dark mode is enabled.
 *
 * The component displays a message header with an icon or user image, 
 * and the message content formatted with markdown. If the message is from 
 * the assistant and has search results or sources, these are displayed in 
 * a separate section.
 */
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

        {/* Search results and sources section */}
        {isAssistant && ((message.search_results && message.search_results.length > 0) || (message.sources && message.sources.length > 0)) && (
          <div className={`mt-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="pt-4 space-y-4">
              {/* Search Results First */}
              {message.search_results && message.search_results.some(result => result.type !== 'youtube') && (
                <div>
                  <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <Search className="w-4 h-4 text-blue-500" />
                    Search Results
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {message.search_results
                      .filter(result => result.type !== 'youtube')
                      .map((result, index) => (
                        <a
                          key={index}
                          href={result.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-3 rounded-lg border transition-colors ${
                            darkMode
                              ? 'bg-gray-700/50 border-gray-600 hover:border-blue-500'
                              : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <div className={`font-medium text-sm mb-1 ${
                            darkMode ? 'text-gray-200' : 'text-gray-700'
                          }`}>
                            {result.title}
                          </div>
                          <div className={`flex items-center gap-1 text-xs ${
                            darkMode ? 'text-blue-400' : 'text-blue-600'
                          }`}>
                            <Search className="w-3 h-3" />
                            <span>{result.type}</span>
                            <ExternalLink className="w-3 h-3" />
                          </div>
                        </a>
                      ))}
                  </div>
                </div>
              )}

              {/* YouTube Results Second */}
              {message.search_results && message.search_results.some(result => result.type === 'youtube') && (
                <div>
                  <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <Youtube className="w-4 h-4 text-red-500" />
                    Related Videos
                  </h3>
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    {message.search_results
                      .filter(result => result.type === 'youtube')
                      .map((result, index) => {
                        const videoId = new URL(result.source).searchParams.get('v');
                        return (
                          <a
                            key={index}
                            href={result.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`group p-2 rounded-lg border transition-all duration-200 ${
                              darkMode
                                ? 'bg-gray-800 border-gray-700 hover:border-red-500'
                                : 'bg-white border-gray-100 hover:border-red-300'
                            }`}
                          >
                            <div className="aspect-video mb-2 rounded-lg overflow-hidden bg-black/10">
                              <img 
                                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                                alt={result.title}
                                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 
                                    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                                }}
                              />
                            </div>
                            <div className={`text-sm font-medium mb-1 line-clamp-1 ${
                              darkMode ? 'text-gray-100' : 'text-gray-900'
                            }`}>
                              {result.title}
                            </div>
                            <div className={`text-xs flex items-center gap-1 ${
                              darkMode ? 'text-red-400' : 'text-red-600'
                            }`}>
                              <Youtube className="w-3 h-3" />
                              <span>Watch</span>
                              <ExternalLink className="w-3 h-3" />
                            </div>
                          </a>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Sources Last */}
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