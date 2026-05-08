import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth, SignedIn, SignedOut } from '@clerk/clerk-react';
import { Search, Plus, Pencil, Archive, Trash2, Download, X } from 'lucide-react';
import clsx from 'clsx';
import {
  listSessions,
  patchSession,
  clearSession,
  searchHistory,
  downloadSessionExport,
  type SessionListItem,
  type SearchHit,
} from '../services/api';
import { Button } from './ui/Button';

interface Props {
  /** Kept for backwards-compat; tokens swap via .dark on <html>. */
  darkMode?: boolean;
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-border">
        <Button
          variant="primary"
          size="sm"
          onClick={onNewChat}
          leadingIcon={<Plus className="w-3.5 h-3.5" />}
          className="w-full justify-center"
        >
          New chat
        </Button>

        <SignedIn>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search history"
              className="w-full pl-8 pr-7 h-8 rounded-md text-[12px] bg-surface border border-border placeholder:text-fg-subtle outline-none focus-visible:shadow-focus"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-fg-subtle hover:text-fg"
                aria-label="clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-fg-subtle px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
              className="w-3 h-3 accent-brand"
            />
            Show archived
          </label>
        </SignedIn>
      </div>

      <SignedOut>
        <div className="px-4 py-6 text-[13px] text-fg-muted">
          Sign in to keep your chat history across devices.
        </div>
      </SignedOut>

      <SignedIn>
        <div className="flex-1 overflow-y-auto px-2 pb-3 pt-2">
          {errMsg && (
            <div className="mb-2 mx-1 px-3 py-2 text-[12px] rounded-md bg-danger-subtle text-danger">
              {errMsg}
            </div>
          )}

          {searchResults !== null ? (
            <div>
              <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.06em] font-medium text-fg-subtle">
                {searching ? 'Searching…' : `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'}`}
              </div>
              {searchResults.map(hit => (
                <button
                  key={hit.message_id}
                  onClick={() => onSelectSession(hit.session_id)}
                  className="w-full text-left px-2.5 py-2 rounded-md hover:bg-surface transition-colors"
                >
                  <div className="font-medium text-[13px] truncate">{hit.title || 'Untitled'}</div>
                  <div
                    className="text-fg-muted text-[11px] mt-1 line-clamp-2 leading-snug [&_mark]:bg-brand/20 [&_mark]:text-fg [&_mark]:rounded-sm [&_mark]:px-0.5"
                    dangerouslySetInnerHTML={{ __html: hit.snippet }}
                  />
                  <div className="text-fg-subtle text-[10px] mt-1">
                    {hit.role} · {relativeTime(hit.matched_at)}
                  </div>
                </button>
              ))}
              {!searching && searchResults.length === 0 && (
                <div className="px-3 py-3 text-[13px] text-fg-muted">No matches.</div>
              )}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {loading && sessions.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-fg-muted">Loading…</li>
              )}
              {!loading && sessions.length === 0 && (
                <li className="px-3 py-2 text-[13px] text-fg-muted">
                  No conversations yet. Ask something to get started.
                </li>
              )}
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                return (
                  <li key={s.id} className="group">
                    {renameId === s.id ? (
                      <div className="flex items-center gap-1 px-1.5 py-1">
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') onRename(s.id);
                            if (e.key === 'Escape') setRenameId(null);
                          }}
                          className="flex-1 px-2 h-7 rounded-md text-[12px] outline-none border border-border bg-surface focus-visible:shadow-focus"
                        />
                        <Button size="sm" variant="primary" onClick={() => onRename(s.id)}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => onSelectSession(s.id)}
                        className={clsx(
                          'px-2.5 py-2 rounded-md cursor-pointer transition-colors duration-150',
                          isActive ? 'bg-surface border border-border' : 'hover:bg-surface'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-[13px] truncate">
                            {s.title || 'Untitled'}
                          </div>
                          <div className="text-fg-subtle text-[10px] shrink-0 tabular-nums">
                            {relativeTime(s.last_accessed_at)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-fg-subtle text-[11px]">
                            {s.message_count} message{s.message_count === 1 ? '' : 's'}
                            {s.is_archived ? ' · archived' : ''}
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <IconBtn title="Rename" onClick={e => {
                              e.stopPropagation();
                              setRenameId(s.id);
                              setRenameDraft(s.title || '');
                            }}>
                              <Pencil className="w-3 h-3" />
                            </IconBtn>
                            <IconBtn title={s.is_archived ? 'Unarchive' : 'Archive'} onClick={e => {
                              e.stopPropagation();
                              onArchive(s);
                            }}>
                              <Archive className="w-3 h-3" />
                            </IconBtn>
                            <IconBtn title="Export markdown" onClick={e => {
                              e.stopPropagation();
                              onExport(s.id);
                            }}>
                              <Download className="w-3 h-3" />
                            </IconBtn>
                            <IconBtn
                              title="Delete"
                              danger
                              onClick={e => {
                                e.stopPropagation();
                                onDelete(s.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </IconBtn>
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
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={clsx(
        'grid place-items-center w-6 h-6 rounded-md transition-colors duration-150',
        danger
          ? 'text-fg-subtle hover:text-danger hover:bg-danger-subtle'
          : 'text-fg-subtle hover:text-fg hover:bg-surface-sunken'
      )}
    >
      {children}
    </button>
  );
}
