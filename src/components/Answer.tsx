import React from 'react';
import ReactMarkdown from 'react-markdown';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { Answer as AnswerType } from '../types';

interface AnswerProps {
  answer: AnswerType;
}

export function Answer({ answer }: AnswerProps) {
  if (answer.loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6">
        <ReactMarkdown className="prose max-w-none">
          {answer.text}
        </ReactMarkdown>
      </div>
      {answer.sources.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Sources</h3>
          <div className="space-y-2">
            {answer.sources.map((source, index) => (
              <a
                key={index}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors"
              >
                <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{source.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}