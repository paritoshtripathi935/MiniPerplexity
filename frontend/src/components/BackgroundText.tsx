import React, { useEffect, useState } from 'react';

const words = [
  "AI",
  "Machine Learning",
  "Neural Networks",
  "Deep Learning",
  "Natural Language",
  "Artificial Intelligence",
  "Data Science",
  "Algorithms",
  "Innovation",
  "Technology"
];

interface BackgroundTextProps {
  darkMode: boolean;
}

interface AnimatedWord {
  id: number;
  text: string;
  displayText: string;
  top: number;
  left: number;
  isTyping: boolean;
}

export function BackgroundText({ darkMode }: BackgroundTextProps) {
  const [currentWord, setCurrentWord] = useState<AnimatedWord | null>(null);
  let nextId = 0;

  const addNewWord = () => {
    const text = words[Math.floor(Math.random() * words.length)];
    const top = Math.random() * 80 + 10;
    const left = Math.random() * 80 + 10;
    
    setCurrentWord({ 
      id: nextId++, 
      text, 
      displayText: '', 
      top, 
      left,
      isTyping: true 
    });
  };

  // Initial word
  useEffect(() => {
    addNewWord();
  }, []);

  // Handle typing animation
  useEffect(() => {
    if (!currentWord || !currentWord.isTyping) return;

    const typeNextChar = () => {
      if (!currentWord) return;

      if (currentWord.displayText.length < currentWord.text.length) {
        setCurrentWord(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            displayText: prev.text.slice(0, prev.displayText.length + 1),
            isTyping: prev.displayText.length + 1 < prev.text.length
          };
        });
      }
    };

    const typingTimeout = setTimeout(typeNextChar, 100);

    return () => clearTimeout(typingTimeout);
  }, [currentWord?.displayText]);

  // Start fade out after typing is complete
  useEffect(() => {
    if (currentWord && !currentWord.isTyping) {
      // Wait for 1 second before starting fade out
      const fadeTimeout = setTimeout(() => {
        setCurrentWord(prev => prev ? { ...prev, isTyping: false } : null);
      }, 1000);

      return () => clearTimeout(fadeTimeout);
    }
  }, [currentWord?.isTyping]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {currentWord && (
        <div
          key={currentWord.id}
          className={`absolute ${
            darkMode 
              ? 'text-gray-700' 
              : 'text-gray-200'
          } text-4xl font-bold`}
          style={{
            top: `${currentWord.top}%`,
            left: `${currentWord.left}%`,
          }}
        >
          <div 
            className={`transition-opacity duration-500 ${
              !currentWord.isTyping ? 'animate-fade-out' : ''
            }`}
            onAnimationEnd={() => {
              addNewWord();
            }}
          >
            {currentWord.displayText}
            <span className="animate-blink">|</span>
          </div>
        </div>
      )}
    </div>
  );
} 