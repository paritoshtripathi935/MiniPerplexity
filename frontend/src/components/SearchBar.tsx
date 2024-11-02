import React, { useState, useRef, useEffect } from 'react';
import { Send, Link } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string, customUrl?: string) => void;
  loading: boolean;
}

const EXAMPLE_QUERIES = [
  "What are the key features of React hooks?",
  "How does TypeScript improve JavaScript?",
  "Explain the concept of closures in JavaScript",
  "What's new in ES2024?",
  "Best practices for React performance optimization",
];

/**
 * SearchBar component.
 *
 * This component renders a search bar with a typing animation for the placeholder text.
 * It allows users to input a query and submit it for searching.
 *
 * @param {Object} props - The component props.
 * @param {Function} props.onSearch - The function to call when a search is submitted.
 * @param {boolean} props.loading - Indicates if a search is in progress.
 *
 * The component includes:
 * - An input field with a dynamic placeholder that cycles through example queries.
 * - A submit button which is disabled while loading or when the query is empty.
 * - A loading spinner that appears when a search is in progress.
 */
export function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle typing animation for placeholder
  useEffect(() => {
    if (query || loading) return; // Don't animate if there's input or loading

    let currentIndex = 0;
    const targetText = EXAMPLE_QUERIES[placeholderIndex];
    
    const typingInterval = setInterval(() => {
      if (currentIndex <= targetText.length) {
        setCurrentPlaceholder(targetText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        // Wait before starting to erase
        setTimeout(() => {
          const erasingInterval = setInterval(() => {
            if (currentIndex >= 0) {
              setCurrentPlaceholder(targetText.slice(0, currentIndex));
              currentIndex--;
            } else {
              clearInterval(erasingInterval);
              // Move to next placeholder
              setPlaceholderIndex((prev) => (prev + 1) % EXAMPLE_QUERIES.length);
            }
          }, 50); // Faster erasing speed
        }, 1500); // Pause before erasing
      }
    }, 100); // Typing speed

    return () => {
      clearInterval(typingInterval);
    };
  }, [placeholderIndex, query, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      const validUrl = customUrl.trim() ? isValidUrl(customUrl.trim()) : undefined;
      onSearch(query.trim(), validUrl ? customUrl.trim() : undefined);
      setQuery('');
      setCustomUrl('');
    }
  };

  // Add URL validation helper
  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative space-y-2">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={currentPlaceholder || "Ask anything..."}
          className="w-full p-4 pr-24 rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          disabled={loading}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          >
            <Link className="w-5 h-5" />
          </button>
          {loading ? (
            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" />
          ) : (
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      
      {showUrlInput && (
        <input
          type="url"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Enter custom URL (optional)"
          className="w-full p-3 rounded-lg border bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
        />
      )}
    </form>
  );
}