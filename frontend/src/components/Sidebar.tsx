import React, { useState } from 'react';
import { Calculator, MessageSquare, Sparkles } from 'lucide-react';
import { SessionsSidebar } from './SessionsSidebar';
import { PlayPicker } from './PlayPicker';
import { Calculators } from './Calculators';
import type { Play } from '../services/api';

type Tab = 'plays' | 'chats' | 'calc';

interface Props {
  darkMode: boolean;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onRunPlay: (play: Play, query: string) => void;
  refreshSignal?: number;
}

const TAB_BUTTONS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'plays', label: 'Plays', icon: Sparkles },
  { id: 'chats', label: 'Chats', icon: MessageSquare },
  { id: 'calc', label: 'Calc', icon: Calculator },
];

export function Sidebar({
  darkMode,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onRunPlay,
  refreshSignal,
}: Props) {
  const [tab, setTab] = useState<Tab>('plays');

  const wrap = `flex flex-col h-full w-72 shrink-0 border-r ${
    darkMode
      ? 'bg-gray-950 border-gray-800 text-gray-200'
      : 'bg-gray-50 border-gray-200 text-gray-800'
  }`;

  return (
    <aside className={wrap}>
      <div className={`px-3 pt-3`}>
        <div className="flex items-center gap-1 mb-2">
          <Sparkles className="w-5 h-5 text-blue-500" />
          <span className="font-semibold tracking-tight">PaidPilot</span>
        </div>
        <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${
          darkMode ? 'bg-gray-900' : 'bg-gray-100'
        }`}>
          {TAB_BUTTONS.map(t => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium ${
                  active
                    ? darkMode
                      ? 'bg-gray-700 text-white'
                      : 'bg-white text-gray-900 shadow-sm'
                    : darkMode
                      ? 'text-gray-400 hover:text-gray-200'
                      : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 mt-2">
        {tab === 'plays' && <PlayPicker darkMode={darkMode} onRun={onRunPlay} />}
        {tab === 'chats' && (
          <div className="h-full">
            <SessionsSidebar
              darkMode={darkMode}
              activeSessionId={activeSessionId}
              onSelectSession={onSelectSession}
              onNewChat={onNewChat}
              refreshSignal={refreshSignal}
            />
          </div>
        )}
        {tab === 'calc' && <Calculators darkMode={darkMode} />}
      </div>
    </aside>
  );
}
