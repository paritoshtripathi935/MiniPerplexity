import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink } from 'lucide-react';
import type { Answer as AnswerType } from '../types';

interface AnswerProps {
  answer: AnswerType;
  darkMode: boolean;
}

/**
 * Renders an answer with typing animation, copy functionality, and displays search results and sources.
 *
 * @param answer - The answer object containing text, sources, and loading state.
 * @param darkMode - Boolean indicating if dark mode is enabled.
 *
 * @remarks
 * - Displays the answer text with a typing animation, which can be stopped to reveal the full text.
 * - Includes a button to copy the answer text to the clipboard.
 * - Displays search results and sources if available.
 * - Uses Tailwind CSS classes for styling.
 */
export function Answer({ answer, darkMode }: AnswerProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (answer.loading) {
      setDisplayedText('');
      setCurrentIndex(0);
      setIsTyping(true);
      return;
    }

    if (isTyping && currentIndex < answer.text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + answer.text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, 50); // Adjust typing speed here

      return () => clearTimeout(timer);
    } else if (currentIndex >= answer.text.length) {
      setIsTyping(false); // Stop typing when done
    }
  }, [currentIndex, answer.loading, answer.text, isTyping]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answer.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleStopTyping = () => {
    setIsTyping(false);
    setDisplayedText(answer.text); // Show the full text immediately
  };

  return (
    <div className={`rounded-xl shadow-lg border overflow-hidden transition-all duration-200 hover:shadow-xl ${
      darkMode 
        ? 'bg-gray-800 border-gray-700' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="p-6 relative">
        <button
          onClick={handleCopy}
          className={`absolute top-4 right-4 px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 flex items-center gap-2 ${
            darkMode
              ? 'text-gray-300 bg-gray-700 hover:bg-gray-600'
              : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copy
            </>
          )}
        </button>
        <ReactMarkdown className={`prose max-w-none ${
          darkMode ? 'prose-invert prose-blue-invert' : 'prose-blue'
        }`}>
          {displayedText}
        </ReactMarkdown>
        <button
          onClick={handleStopTyping}
          className={`absolute bottom-4 right-4 px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 flex items-center gap-2 ${
            darkMode
              ? 'text-gray-300 bg-red-700 hover:bg-red-600'
              : 'text-gray-700 bg-red-100 hover:bg-red-200'
          }`}
        >
          Stop
        </button>
      </div>
      {answer.search_results && answer.search_results.length > 0 && (
        <div className={`border-t p-6 ${
          darkMode 
            ? 'border-gray-700 bg-gray-900/50' 
            : 'border-gray-200 bg-gray-50'
        }`}>
          <h3 className={`text-sm font-semibold mb-4 ${
            darkMode ? 'text-gray-100' : 'text-gray-900'
          }`}>Search Results</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {answer.search_results.map((result, index) => (
              <div key={index} className={`p-4 rounded-lg border transition-colors duration-200 ${
                darkMode
                  ? 'bg-gray-800 border-gray-700 hover:border-blue-500'
                  : 'bg-white border-gray-100 hover:border-blue-300'
              }`}>
                <div className={`font-medium mb-1 ${
                  darkMode ? 'text-gray-100' : 'text-gray-900'
                }`}>
                  {result.title}
                </div>
                <a
                  href={result.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`hover:text-blue-400 text-sm flex items-center gap-1 ${
                    darkMode ? 'text-blue-400' : 'text-blue-600'
                  }`}
                >
                  <span>{result.type}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      {answer.sources.length > 0 && (
        <div className={`border-t p-6 ${
          darkMode 
            ? 'border-gray-700 bg-gray-900/50' 
            : 'border-gray-200 bg-gray-50'
        }`}>
          <h3 className={`text-sm font-semibold mb-4 ${
            darkMode ? 'text-gray-100' : 'text-gray-900'
          }`}>Sources</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {answer.sources.map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 p-3 rounded-lg border transition-all duration-200 ${
                  darkMode
                    ? 'bg-gray-800 border-gray-700 text-gray-300 hover:text-blue-400 hover:border-blue-500'
                    : 'bg-white border-gray-100 text-gray-600 hover:text-blue-600 hover:border-blue-300'
                }`}
              >
                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{source.url}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
