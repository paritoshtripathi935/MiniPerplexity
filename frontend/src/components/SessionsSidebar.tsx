import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, SignedIn, SignedOut } from '@clerk/clerk-react';
import { Search, Plus, Pencil, Archive, Trash2, Download, X } from 'lucide-react';
import {
  listSessions,
  patchSession,
  clearSession,
  searchHistory,
  downloadSessionExport,
  type SessionListItem,
  type SearchHit,
} from '../services/api';

interface Props {
  darkMode: boolean;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  /** Bumped by parent after a successful chat round so the list refreshes. */
  refreshSignal?: number;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SessionsSidebar({
  darkMode,
  activeSessionId,
  onSelectSession,
  onNewChat,
  refreshSignal = 0,
}: Props) {
  const { getToken, isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);

  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setErrMsg(null);
    try {
      const { sessions } = await listSessions(getToken, { includeArchived });
      setSessions(sessions);
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [getToken, includeArchived, isSignedIn]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshSignal]);

  // Debounced FTS
  useEffect(() => {
    if (!isSignedIn) return;
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const { results } = await searchHistory(query.trim(), getToken);
        setSearchResults(results);
      } catch (e: any) {
        setErrMsg(e?.message ?? 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, getToken, isSignedIn]);

  const onRename = async (id: string) => {
    const title = renameDraft.trim();
    if (!title) {
      setRenameId(null);
      return;
    }
    try {
      await patchSession(id, { title }, getToken);
      setRenameId(null);
      setRenameDraft('');
      refresh();
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Rename failed');
    }
  };

  const onArchive = async (s: SessionListItem) => {
    try {
      await patchSession(s.id, { is_archived: !s.is_archived }, getToken);
      refresh();
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Archive failed');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await clearSession(id, getToken);
      if (id === activeSessionId) onNewChat();
      refresh();
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Delete failed');
    }
  };

  const onExport = async (id: string) => {
    try {
      await downloadSessionExport(id, getToken);
    } catch (e: any) {
      setErrMsg(e?.message ?? 'Export failed');
    }
  };

  const containerCls = useMemo(
    () => `flex flex-col h-full`,
    []
  );
  const itemBase = darkMode
    ? 'hover:bg-gray-800 border-gray-800'
    : 'hover:bg-white border-gray-200';
  const itemActive = darkMode ? 'bg-gray-800' : 'bg-white shadow-sm';

  return (
    <aside className={containerCls}>
      <div className="p-3 space-y-2">
        <button
          onClick={onNewChat}
          className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
            darkMode
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          <Plus className="w-4 h-4" /> New chat
        </button>

        <SignedIn>
          <div className={`relative ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 opacity-60" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search history…"
              className={`w-full pl-8 pr-7 py-2 rounded-lg text-sm outline-none border ${
                darkMode
                  ? 'bg-gray-900 border-gray-800 placeholder-gray-500'
                  : 'bg-white border-gray-200 placeholder-gray-400'
              }`}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-2 opacity-60 hover:opacity-100"
                aria-label="clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs opacity-75 px-1">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
            />
            Show archived
          </label>
        </SignedIn>
      </div>

      <SignedOut>
        <div className="px-4 py-6 text-sm opacity-75">
          Sign in to keep your chat history across devices.
        </div>
      </SignedOut>

      <SignedIn>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {errMsg && (
            <div className="mb-2 px-3 py-2 text-xs rounded bg-red-500/10 text-red-400">
              {errMsg}
            </div>
          )}

          {searchResults !== null ? (
            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wider opacity-60">
                {searching ? 'Searching…' : `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`}
              </div>
              {searchResults.map(hit => (
                <button
                  key={hit.message_id}
                  onClick={() => onSelectSession(hit.session_id)}
                  className={`w-full text-left px-3 py-2 rounded-lg border-b text-sm ${itemBase}`}
                >
                  <div className="font-medium truncate">{hit.title || 'Untitled'}</div>
                  <div
                    className="opacity-75 text-xs mt-1 line-clamp-2"
                    // ts_headline returns sanitised text + <mark> tags only
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                  <div className="opacity-50 text-[10px] mt-1">
                    {hit.role} · {relativeTime(hit.matched_at)}
                  </div>
                </button>
              ))}
              {!searching && searchResults.length === 0 && (
                <div className="px-3 py-3 text-sm opacity-60">No matches.</div>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {loading && sessions.length === 0 && (
                <li className="px-3 py-2 text-sm opacity-60">Loading…</li>
              )}
              {!loading && sessions.length === 0 && (
                <li className="px-3 py-2 text-sm opacity-60">
                  No conversations yet. Ask something to get started.
                </li>
              )}
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                return (
                  <li
                    key={s.id}
                    className={`rounded-lg border ${itemBase} ${isActive ? itemActive : ''}`}
                  >
                    {renameId === s.id ? (
                      <div className="flex items-center gap-1 px-2 py-1">
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onRename(s.id);
                            if (e.key === 'Escape') setRenameId(null);
                          }}
                          className={`flex-1 px-2 py-1 rounded text-sm outline-none border ${
                            darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'
                          }`}
                        />
                        <button
                          onClick={() => onRename(s.id)}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div
                        className="px-3 py-2 cursor-pointer"
                        onClick={() => onSelectSession(s.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">
                            {s.title || 'Untitled'}
                          </div>
                          <div className="opacity-50 text-[10px] shrink-0">
                            {relativeTime(s.last_accessed_at)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="opacity-50 text-xs">
                            {s.message_count} message{s.message_count === 1 ? '' : 's'}
                            {s.is_archived ? ' · archived' : ''}
                          </div>
                          <div className="flex items-center gap-1 opacity-60 hover:opacity-100">
                            <button
                              title="Rename"
                              onClick={e => {
                                e.stopPropagation();
                                setRenameId(s.id);
                                setRenameDraft(s.title || '');
                              }}
                              className="p-1 rounded hover:bg-black/10"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title={s.is_archived ? 'Unarchive' : 'Archive'}
                              onClick={e => {
                                e.stopPropagation();
                                onArchive(s);
                              }}
                              className="p-1 rounded hover:bg-black/10"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Export markdown"
                              onClick={e => {
                                e.stopPropagation();
                                onExport(s.id);
                              }}
                              className="p-1 rounded hover:bg-black/10"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Delete"
                              onClick={e => {
                                e.stopPropagation();
                                onDelete(s.id);
                              }}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SignedIn>
    </aside>
  );
}
