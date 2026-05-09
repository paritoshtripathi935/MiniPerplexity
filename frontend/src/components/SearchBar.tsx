import React, {
  KeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { ArrowUp, Link as LinkIcon, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { SlashMenu } from './SlashMenu';
import type { Play } from '../services/api';

interface Props {
  onSearch: (query: string, customUrl?: string) => void;
  loading: boolean;
  placeholder?: string;
  /** When provided, typing `/` opens a fuzzy-search Plays popover. */
  plays?: Play[];
  /** Fired when the user picks a play from the slash menu. */
  onPlaySelect?: (play: Play) => void;
  /** When set, the composer renders an "active play" chip above the textarea
   * so the user can see which play context will be applied to the next turn. */
  activePlay?: Play | null;
  /** Fired when the user dismisses the active-play chip. */
  onClearActivePlay?: () => void;
}

/** Imperative API for prefilling the composer from starter prompts. */
export interface ComposerHandle {
  prefill: (text: string) => void;
  focus: () => void;
}

/**
 * Composer — replaces the old <input>+typing-animation pattern.
 *
 * Auto-growing textarea. Enter inserts a newline; ⌘/Ctrl+Enter submits.
 * Custom URL is a chip toggle that reveals an inline field.
 *
 * Use the imperative ref to prefill from starter-prompt buttons:
 *   const ref = useRef<ComposerHandle>(null);
 *   ref.current?.prefill("…");
 */
const MAX_LINES = 8;

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export const SearchBar = forwardRef<ComposerHandle, Props>(function SearchBar(
  {
    onSearch,
    loading,
    placeholder = 'Ask anything paid-acquisition…    Tip: type / to run a play',
    plays = [],
    onPlaySelect,
    activePlay,
    onClearActivePlay,
  },
  ref
) {
  const [query, setQuery] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Slash-menu mode is on whenever the textarea content (trimmed of leading
  // whitespace only) starts with "/" and a Play set is available. The text
  // after the slash is the live filter.
  const slashMode = !!plays.length && /^\s*\/[^\n]*$/.test(query);
  const slashFilter = slashMode ? query.replace(/^\s*\//, '') : '';

  // Auto-grow textarea up to MAX_LINES.
  const resize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || '20');
    const max = MAX_LINES * lineHeight + 24; // padding budget
    ta.style.height = Math.min(ta.scrollHeight, max) + 'px';
  }, []);
  useEffect(() => {
    resize();
  }, [query, resize]);

  useImperativeHandle(ref, () => ({
    prefill: (text: string) => {
      setQuery(text);
      // wait a tick for the textarea to render with the new value, then
      // measure & focus.
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const ta = textareaRef.current;
        if (ta) ta.setSelectionRange(text.length, text.length);
        resize();
      });
    },
    focus: () => textareaRef.current?.focus(),
  }), [resize]);

  const submit = () => {
    if (!query.trim() || loading) return;
    const url = customUrl.trim();
    onSearch(query.trim(), url && isValidUrl(url) ? url : undefined);
    setQuery('');
    setCustomUrl('');
    setShowUrlInput(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // While the slash menu is open, let it own ↑↓/Enter/Esc so the user
    // can navigate the popover without these keys reaching the textarea.
    if (slashMode && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      // Let `Enter` insert a newline only if no plays match — handled by
      // SlashMenu's keydown listener returning early.
      return;
    }
    // ⌘/Ctrl + Enter submits.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const handlePlaySelect = (play: Play) => {
    setQuery(''); // clear the slash text — host opens the run modal
    onPlaySelect?.(play);
  };

  const sendKey = isMac() ? '⌘' : 'Ctrl';

  return (
    <div className="space-y-2">
      <div
        className={clsx(
          'group/composer relative flex flex-col rounded-xl border bg-surface',
          'border-border focus-within:border-border-strong focus-within:shadow-card',
          'transition-colors duration-150'
        )}
      >
        {slashMode && (
          <SlashMenu
            plays={plays}
            query={slashFilter}
            onSelect={handlePlaySelect}
            onDismiss={() => setQuery('')}
          />
        )}
        {activePlay && (
          <div className="px-3 pt-3">
            <div className="inline-flex items-center gap-2 h-7 pl-2 pr-1 rounded-full bg-brand-subtle text-brand text-[12px] font-medium">
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              <span className="truncate max-w-[200px]">{activePlay.title}</span>
              {onClearActivePlay && (
                <button
                  type="button"
                  onClick={onClearActivePlay}
                  className="grid place-items-center w-5 h-5 rounded-full hover:bg-brand/10 transition-colors"
                  aria-label="Clear active play"
                >
                  <X className="w-3 h-3" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={loading}
          className={clsx(
            'block w-full resize-none bg-transparent outline-none px-4 pt-3 pb-2',
            'text-[15px] leading-[1.5] placeholder:text-fg-subtle',
            'disabled:opacity-60'
          )}
        />

        <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowUrlInput(s => !s)}
              className={clsx(
                'inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px]',
                'transition-colors duration-150',
                showUrlInput
                  ? 'bg-brand-subtle text-brand'
                  : 'text-fg-subtle hover:text-fg hover:bg-surface-sunken'
              )}
              aria-pressed={showUrlInput}
            >
              <LinkIcon className="w-3 h-3" />
              {showUrlInput ? 'URL added' : 'Add URL'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-fg-subtle tabular-nums">
              {sendKey} ↵ to send
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={loading || !query.trim()}
              aria-label="Send"
              className={clsx(
                'grid place-items-center w-7 h-7 rounded-md transition-colors duration-150',
                'disabled:opacity-40 disabled:pointer-events-none',
                query.trim()
                  ? 'bg-brand text-brand-fg hover:bg-brand/90'
                  : 'bg-surface-sunken text-fg-subtle'
              )}
            >
              {loading ? (
                <span
                  className="w-3 h-3 rounded-full border-2 border-current border-r-transparent animate-spin"
                  aria-hidden
                />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2 animate-fade-in">
          <input
            type="url"
            autoFocus
            value={customUrl}
            onChange={e => setCustomUrl(e.target.value)}
            placeholder="Paste a URL — the assistant will read this page instead of searching."
            className="flex-1 px-3 h-8 rounded-md text-[12px] bg-surface border border-border placeholder:text-fg-subtle outline-none focus-visible:shadow-focus"
          />
          <button
            onClick={() => {
              setShowUrlInput(false);
              setCustomUrl('');
            }}
            className="grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
            aria-label="Remove URL"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});
