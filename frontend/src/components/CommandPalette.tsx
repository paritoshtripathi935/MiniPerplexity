/**
 * Command palette (⌘K) — operator-style quick switcher.
 *
 * Inspired by Linear's command menu / the Stitch `command_palette_dark`
 * mock for PAI-13. Modal overlay, grouped results, kbd-shortcut chips,
 * selected-row 2px primary left bar.
 *
 * Layout: floating 520×440px modal centered. Backdrop dimmed.
 * Groups: Investigations · Plays · Calculators · Jump to.
 *
 * Data fetched lazily on first open and reused. The palette does not
 * pay a fetch on every page mount.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { v4 as uuidv4 } from 'uuid';
import {
  Calculator,
  Home,
  PlayCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import {
  listPlays,
  listSessions,
  type Play,
  type SessionListItem,
} from '../services/api';

/* ----------------------------- Context / hook ---------------------------- */

interface PaletteContext {
  open: boolean;
  setOpen: (next: boolean | ((v: boolean) => boolean)) => void;
}

const Ctx = createContext<PaletteContext | null>(null);

/** Read the palette state. Safe to call outside the provider; returns a
 * no-op fallback so consumers can call from any tree depth. */
export function useCommandPalette(): PaletteContext {
  return (
    useContext(Ctx) ?? {
      open: false,
      setOpen: () => {},
    }
  );
}

/** Wraps the app so any descendant can open / close the palette. Mount
 * once near the top of the routed tree (inside <AppLayout>). The palette
 * UI itself is rendered by <CommandPalette /> — keep them separate so
 * the provider can wrap routed children without re-mounting them when
 * the palette closes. */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* --------------------------- Hotkey utilities --------------------------- */

const isInputTarget = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    t.isContentEditable
  );
};

const isMeta = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;

/** Linear-style G+X chord: press G then a follow-up letter within ~1.5s. */
const CHORD_TIMEOUT_MS = 1500;

/* ------------------------------ Palette UI ------------------------------ */

interface PaletteData {
  sessions: SessionListItem[];
  plays: Play[];
  loadedAt: number | null;
}

const STALE_MS = 30_000;

/** Renders the palette modal. Always mounted; visibility driven by the
 * provider state so opening is instant after the first paint. */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  const [data, setData] = useState<PaletteData>({
    sessions: [],
    plays: [],
    loadedAt: null,
  });

  // Reset search input on close so re-opening is fresh.
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Lazy / cached data fetch. Refetch only if the cache is stale.
  const inflight = useRef(false);
  useEffect(() => {
    if (!open || inflight.current) return;
    const stale =
      data.loadedAt === null || Date.now() - data.loadedAt > STALE_MS;
    if (!stale) return;

    inflight.current = true;
    (async () => {
      try {
        const [sessionsRes, playsRes] = await Promise.all([
          isSignedIn
            ? listSessions(getToken, { limit: 8 }).catch(() => ({ sessions: [] }))
            : Promise.resolve({ sessions: [] }),
          listPlays().catch(() => ({ plays: [] })),
        ]);
        setData({
          sessions: sessionsRes.sessions,
          plays: playsRes.plays,
          loadedAt: Date.now(),
        });
      } finally {
        inflight.current = false;
      }
    })();
  }, [open, isSignedIn, getToken, data.loadedAt]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const run = useCallback(
    (to: string) => {
      close();
      navigate(to);
    },
    [close, navigate],
  );

  const newInvestigation = useCallback(() => {
    close();
    navigate(`/investigations/${uuidv4()}`);
  }, [close, navigate]);

  // Global hotkeys: ⌘K toggles palette; ⌘N/P/E navigate directly;
  // G+D / G+S chord jumps to dashboard/settings.
  const chordActive = useRef(false);
  const chordTimer = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs unless it's an explicit ⌘ shortcut.
      const inInput = isInputTarget(e);

      if (isMeta(e) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(v => !v);
        return;
      }
      if (isMeta(e) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        newInvestigation();
        return;
      }
      if (isMeta(e) && (e.key === 'p' || e.key === 'P') && !e.shiftKey) {
        // ⌘P would normally trigger browser Print; we intentionally
        // override it inside the app for "open Plays". Hold Shift to
        // keep the native Print if a user needs it.
        e.preventDefault();
        run('/plays');
        return;
      }
      if (isMeta(e) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        run('/calc');
        return;
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
        return;
      }

      if (inInput) return;

      // Linear-style chord: press G then D/S/H/I/P within CHORD_TIMEOUT_MS.
      if (!chordActive.current && (e.key === 'g' || e.key === 'G')) {
        chordActive.current = true;
        if (chordTimer.current) window.clearTimeout(chordTimer.current);
        chordTimer.current = window.setTimeout(() => {
          chordActive.current = false;
        }, CHORD_TIMEOUT_MS);
        return;
      }
      if (chordActive.current) {
        chordActive.current = false;
        if (chordTimer.current) window.clearTimeout(chordTimer.current);
        const k = e.key.toLowerCase();
        if (k === 'd' || k === 'h') {
          e.preventDefault();
          run('/');
        } else if (k === 's') {
          e.preventDefault();
          run('/settings');
        } else if (k === 'i') {
          e.preventDefault();
          run('/investigations');
        } else if (k === 'p') {
          e.preventDefault();
          run('/plays');
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (chordTimer.current) window.clearTimeout(chordTimer.current);
    };
  }, [open, setOpen, close, run, newInvestigation]);

  if (!open) return null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 grid place-items-start justify-center pt-[20vh]"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40"
        aria-hidden
        onClick={close}
      />

      {/* Modal */}
      <div className="relative z-10 w-[calc(100%-2rem)] max-w-[520px] max-h-[440px] flex flex-col rounded-card bg-surface-container-high border border-outline-variant shadow-dialog overflow-hidden">
        {/* Search input */}
        <div className="flex-none px-4 py-3 border-b border-outline-variant/70">
          <Command.Input
            value={search}
            onValueChange={setSearch}
            placeholder="Search investigations, plays, calculators…"
            className="w-full bg-transparent border-0 outline-none text-body-base text-on-surface placeholder:text-outline focus:ring-0 p-0"
          />
        </div>

        {/* Results */}
        <Command.List className="flex-1 overflow-y-auto py-2">
          <Command.Empty className="px-4 py-6 text-body-sm text-on-surface-variant text-center">
            No results. Try a different search.
          </Command.Empty>

          <PaletteGroup heading="Investigations">
            <PaletteItem
              icon={<Plus className="w-4 h-4" />}
              label="New investigation"
              shortcut={['⌘', 'N']}
              onSelect={newInvestigation}
            />
            {data.sessions.map(s => (
              <PaletteItem
                key={s.id}
                icon={<Search className="w-4 h-4" />}
                label={s.title?.trim() || 'Untitled investigation'}
                onSelect={() => run(`/investigations/${s.id}`)}
                // cmdk filters on `value`; include the excerpt so search
                // matches turn content, not just titles.
                value={`${s.title ?? ''} ${s.last_message_excerpt ?? ''} ${s.id}`}
              />
            ))}
          </PaletteGroup>

          {data.plays.length > 0 && (
            <PaletteGroup heading="Plays">
              {data.plays.map(p => (
                <PaletteItem
                  key={p.id}
                  icon={<PlayCircle className="w-4 h-4" />}
                  label={p.title}
                  trailing={
                    <span className="text-label-caps text-outline truncate max-w-[180px]">
                      {p.category}
                    </span>
                  }
                  onSelect={() => run('/plays')}
                  value={`${p.title} ${p.category} ${p.description}`}
                />
              ))}
            </PaletteGroup>
          )}

          <PaletteGroup heading="Calculators">
            <PaletteItem
              icon={<Calculator className="w-4 h-4" />}
              label="Open calculators"
              shortcut={['⌘', 'E']}
              onSelect={() => run('/calc')}
            />
          </PaletteGroup>

          <PaletteGroup heading="Jump to">
            <PaletteItem
              icon={<Home className="w-4 h-4" />}
              label="Dashboard"
              shortcut={['G', 'D']}
              onSelect={() => run('/')}
            />
            <PaletteItem
              icon={<Search className="w-4 h-4" />}
              label="Investigations"
              shortcut={['G', 'I']}
              onSelect={() => run('/investigations')}
            />
            <PaletteItem
              icon={<PlayCircle className="w-4 h-4" />}
              label="Plays"
              shortcut={['G', 'P']}
              onSelect={() => run('/plays')}
            />
            <PaletteItem
              icon={<Sparkles className="w-4 h-4" />}
              label="Settings"
              shortcut={['G', 'S']}
              onSelect={() => run('/settings')}
            />
          </PaletteGroup>
        </Command.List>

        {/* Footer */}
        <div className="flex-none px-4 py-2.5 border-t border-outline-variant/70 flex justify-between items-center bg-surface-container">
          <span className="text-body-sm text-outline">
            ↑↓ Navigate · ↵ Select · esc Close
          </span>
          <span className="text-label-caps text-outline/70 uppercase">
            PaidPilot
          </span>
        </div>
      </div>
    </Command.Dialog>
  );
}

/* ----------------------------- Subcomponents ---------------------------- */

function PaletteGroup({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <Command.Group heading={heading} className="mb-1">
      {/* cmdk renders the heading via [cmdk-group-heading]; targeting that
       * via Tailwind plain selectors keeps the markup minimal. */}
      <style>{`
        [cmdk-group-heading] {
          padding: 12px 16px 6px;
          font-size: 11px;
          line-height: 1;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: rgb(var(--m3-outline));
        }
      `}</style>
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  icon,
  label,
  shortcut,
  trailing,
  onSelect,
  value,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string[];
  trailing?: ReactNode;
  onSelect: () => void;
  value?: string;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="relative flex items-center gap-3 px-4 py-2 cursor-pointer text-body-base text-on-surface-variant data-[selected=true]:bg-surface-container-highest data-[selected=true]:text-on-surface group"
    >
      {/* Selected-row 2px primary left bar (per Stitch design). */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary opacity-0 group-data-[selected=true]:opacity-100"
      />
      <span className="text-outline group-data-[selected=true]:text-on-surface">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {trailing}
      {shortcut && (
        <span className="flex items-center gap-1">
          {shortcut.map((k, i) => (
            <kbd
              key={i}
              className="inline-grid place-items-center min-w-[20px] h-[18px] px-1 text-label-caps text-outline bg-surface-container-highest rounded-control"
            >
              {k}
            </kbd>
          ))}
        </span>
      )}
    </Command.Item>
  );
}
