import React, {
  ClipboardEvent,
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
import { getDomain, isValidUrl } from '../utils/url';

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

const MAX_LINES = 8;
/** Strict pure-URL paste — whole clipboard payload is one URL with optional
 * surrounding whitespace. Mixed text + URL pastes are intentionally left as-is
 * (extracting from prose is jumpier than it's worth). */
const PURE_URL_PASTE_RE = /^\s*(https?:\/\/\S+)\s*$/i;

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export const SearchBar = forwardRef<ComposerHandle, Props>(function SearchBar(
  {
    onSearch,
    loading,
    placeholder = 'Continue the investigation…    Tip: type / to run a play',
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

  const hasUrl = !!customUrl.trim();
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
    if (slashMode && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  /**
   * Detect pure-URL pastes and convert them into the URL chip rather than
   * letting them land inside the textarea body. Mixed text + URL pastes
   * fall through to default behaviour — the user almost certainly wants
   * to keep the surrounding context in the question.
   */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    const m = pasted.match(PURE_URL_PASTE_RE);
    if (!m) return;
    const url = m[1];
    if (!isValidUrl(url)) return;
    e.preventDefault();
    setCustomUrl(url);
    // Don't auto-open the inline editor — the chip is the canonical UI for
    // a chipped URL. The user can still click "Add URL" to edit it.
    setShowUrlInput(false);
  };

  const clearUrl = () => {
    setCustomUrl('');
    setShowUrlInput(false);
  };

  const handlePlaySelect = (play: Play) => {
    setQuery(''); // clear the slash text — host opens the run modal
    onPlaySelect?.(play);
  };

  const sendKey = isMac() ? '⌘' : 'Ctrl';
  const showChipRow = !!activePlay || hasUrl;

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

        {showChipRow && (
          <div className="px-3 pt-3 flex flex-wrap gap-1.5">
            {activePlay && (
              <Chip
                tone="brand"
                icon={<Sparkles className="w-3 h-3" strokeWidth={2.5} />}
                label={activePlay.title}
                onClear={onClearActivePlay}
                clearLabel="Clear active play"
              />
            )}
            {hasUrl && (
              <Chip
                tone="neutral"
                icon={<LinkIcon className="w-3 h-3" strokeWidth={2.5} />}
                label={getDomain(customUrl)}
                title={customUrl}
                onClear={clearUrl}
                clearLabel="Remove URL"
              />
            )}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
                hasUrl || showUrlInput
                  ? 'bg-brand-subtle text-brand'
                  : 'text-fg-subtle hover:text-fg hover:bg-surface-sunken'
              )}
              aria-pressed={showUrlInput}
            >
              <LinkIcon className="w-3 h-3" />
              {hasUrl ? 'Edit URL' : showUrlInput ? 'URL editor open' : 'Add URL'}
            </button>
            {!hasUrl && !showUrlInput && (
              <span className="hidden md:inline text-[11px] text-fg-subtle ml-1">
                or paste one
              </span>
            )}
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
            placeholder="Paste a URL — PaidPilot will read this page instead of running a search."
            className="flex-1 px-3 h-8 rounded-md text-[12px] bg-surface border border-border placeholder:text-fg-subtle outline-none focus-visible:shadow-focus"
          />
          <button
            onClick={clearUrl}
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

// ---------- Composer chip primitive --------------------------------------

interface ChipProps {
  tone: 'brand' | 'neutral';
  icon: React.ReactNode;
  label: string;
  /** Tooltip on hover — useful for showing the full URL when the label is the hostname. */
  title?: string;
  onClear?: () => void;
  clearLabel?: string;
}

function Chip({ tone, icon, label, title, onClear, clearLabel }: ChipProps) {
  const palette =
    tone === 'brand'
      ? 'bg-brand-subtle text-brand hover:bg-brand-subtle/80'
      : 'bg-surface-sunken text-fg border border-border hover:border-border-strong';
  const clearHover =
    tone === 'brand' ? 'hover:bg-brand/10' : 'hover:bg-fg/10';
  return (
    <div
      title={title}
      className={clsx(
        'inline-flex items-center gap-2 h-7 pl-2 pr-1 rounded-full text-[12px] font-medium transition-colors',
        palette
      )}
    >
      {icon}
      <span className="truncate max-w-[200px]">{label}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className={clsx(
            'grid place-items-center w-5 h-5 rounded-full transition-colors',
            clearHover
          )}
          aria-label={clearLabel}
        >
          <X className="w-3 h-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
