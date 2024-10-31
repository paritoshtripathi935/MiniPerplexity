import React, { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => Promise<void>;
  loading: boolean;
}

export function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const placeholders = [
    "How is the weather in Paris?",
    "What are the benefits of meditation?", 
    "Explain quantum computing",
    "What's the history of pizza?",
    "How do electric cars work?",
    "What causes northern lights?"
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [currentPlaceholder, setCurrentPlaceholder] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  useEffect(() => {
    let typingTimer: ReturnType<typeof setTimeout>;
    let currentIndex = 0;
    let currentText = '';

    const typeCharacter = () => {
      if (currentIndex < placeholders[placeholderIndex].length && isTyping) {
        currentText = placeholders[placeholderIndex].slice(0, currentIndex + 1);
        setCurrentPlaceholder(currentText);
        currentIndex++;
        typingTimer = setTimeout(typeCharacter, 100);
      } else {
        setIsTyping(false);
        setTimeout(() => {
          setIsTyping(true);
          currentIndex = 0;
          setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
        }, 2000);
      }
    };

    typeCharacter();

    return () => {
      clearTimeout(typingTimer);
    };
  }, [placeholderIndex, isTyping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    await onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={currentPlaceholder}
          className="w-full px-4 py-3 pl-12 pr-16 text-gray-900 placeholder-gray-500 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Searching</span>
            </>
          ) : (
            <span>Search</span>
          )}
        </button>
      </div>
    </form>
  );
}