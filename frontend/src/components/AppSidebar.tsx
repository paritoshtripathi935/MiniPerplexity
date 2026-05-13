/**
 * Persistent left-rail primary navigation (Stitch addendum spec).
 *
 *   - 240px when expanded; 64px when collapsed.
 *   - Toggle: pill chevron at the bottom-right edge of the sidebar
 *     (visible on hover above lg; always-visible on touch). Keyboard
 *     shortcut `[` toggles too.
 *   - localStorage `paidpilot-sidebar-collapsed` persists user choice
 *     across sessions and tabs.
 *   - Below lg breakpoint (<1024px) the sidebar hides entirely and a
 *     hamburger in the top-nav opens an expanded slide-over drawer.
 *     There is no collapsed icon-bar variant on mobile.
 *   - When collapsed, hovering a row reveals a small tooltip to the
 *     right with the row's label. Tooltips never appear when expanded.
 *
 * The bottom of the sidebar holds Help + Docs as anchors (matches the
 * Stitch design's persistent secondary actions).
 */
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BookOpen,
  Calculator,
  ChevronRight,
  FolderKanban,
  HelpCircle,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  PlayCircle,
  Plus,
  Search,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';
import { useActiveCampaign } from './ActiveCampaign';

const STORAGE_KEY = 'paidpilot-sidebar-collapsed';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  /** Whether the mobile slide-over drawer is open. */
  drawerOpen: boolean;
  setDrawerOpen: (next: boolean) => void;
}

const SidebarCtx = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // localStorage disabled — in-memory state still works
    }
  }, []);

  const toggleCollapsed = useCallback(
    () => setCollapsed(!collapsed),
    [collapsed, setCollapsed],
  );

  // `[` key toggles the sidebar (Linear / VS Code convention). We skip
  // the binding when the focus is inside a text input or textarea so it
  // doesn't fight composer typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      toggleCollapsed();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  // Cross-tab sync — mirror state when another tab toggles.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setCollapsedState(e.newValue === '1');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, setCollapsed, toggleCollapsed, drawerOpen, setDrawerOpen }),
    [collapsed, setCollapsed, toggleCollapsed, drawerOpen],
  );

  return <SidebarCtx.Provider value={value}>{children}</SidebarCtx.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarCtx);
  if (!ctx) {
    throw new Error('useSidebar must be used inside <SidebarProvider>');
  }
  return ctx;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  end?: boolean;
  /** Highlight the row when the URL starts with one of these prefixes,
   *  in addition to the canonical `to` match. Needed because tool rows
   *  point at the *active* campaign's URL — a different campaign's
   *  /investigations is still "investigations" for highlighting. */
  matchPrefixes?: string[];
}

/** Build the nav given the user's active scope. Tool rows point under the
 *  active campaign's URL when one exists; otherwise they degrade to a
 *  "go pick scope first" link to /projects. */
function buildNav(toolBase: string | null): NavItem[] {
  const tool = (suffix: string) => (toolBase ? `${toolBase}${suffix}` : '/projects');
  return [
    { to: '/', label: 'home', icon: Home, end: true },
    {
      to: tool('/investigations'),
      label: 'investigations',
      icon: Search,
      matchPrefixes: ['/investigations'],
    },
    {
      to: tool('/plays'),
      label: 'plays',
      icon: PlayCircle,
      matchPrefixes: ['/plays'],
    },
    {
      to: tool('/calc'),
      label: 'calculators',
      icon: Calculator,
      matchPrefixes: ['/calc'],
    },
    // Projects + campaigns gets its own top-level entry — it's the
    // navigation pivot now. `end: false` so /projects/:id and
    // /projects/:id/c/:cid keep this row highlighted (but NOT the
    // /projects/:p/c/:c/{tool} paths, which highlight the tool row).
    { to: '/projects', label: 'projects', icon: FolderKanban },
    { to: '/settings', label: 'settings', icon: Settings, end: true },
  ];
}

interface Props {
  onNewInvestigation?: () => void;
}

/** The desktop sidebar. The mobile drawer reuses this same body via
 *  variant="drawer" so the expanded state is identical regardless of
 *  surface. */
export function AppSidebar({ onNewInvestigation }: Props) {
  const { collapsed } = useSidebar();
  return (
    <aside
      className={clsx(
        'hidden lg:flex shrink-0 flex-col border-r border-border/60 bg-surface-container-low transition-[width] duration-150 ease-out',
        collapsed ? 'w-[64px]' : 'w-[240px]',
        'h-[calc(100vh-3.5rem)] sticky top-14',
      )}
    >
      <SidebarBody onNewInvestigation={onNewInvestigation} />
      <CollapseChevron />
    </aside>
  );
}

/** Slide-over drawer used below the lg breakpoint. Always renders the
 *  expanded body — no icon-bar on mobile. */
export function AppSidebarDrawer({ onNewInvestigation }: Props) {
  const { drawerOpen, setDrawerOpen } = useSidebar();
  if (!drawerOpen) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <button
        type="button"
        aria-label="close drawer"
        onClick={() => setDrawerOpen(false)}
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />
      <aside className="relative w-[260px] h-full bg-surface-container-low border-r border-border/60 flex flex-col motion-safe:animate-slide-in-left">
        <SidebarBody
          forceExpanded
          onNavigate={() => setDrawerOpen(false)}
          onNewInvestigation={() => {
            setDrawerOpen(false);
            onNewInvestigation?.();
          }}
        />
      </aside>
    </div>
  );
}

function SidebarBody({
  forceExpanded,
  onNavigate,
  onNewInvestigation,
}: {
  forceExpanded?: boolean;
  onNavigate?: () => void;
  onNewInvestigation?: () => void;
}) {
  const ctx = useSidebar();
  const collapsed = forceExpanded ? false : ctx.collapsed;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* New investigation CTA */}
      <div className="px-2 pt-3 pb-2">
        {collapsed ? (
          <RowWithTooltip label="new investigation" collapsed>
            <button
              type="button"
              onClick={onNewInvestigation}
              className="mx-auto grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.5)] transition-shadow"
              aria-label="new investigation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </RowWithTooltip>
        ) : (
          <button
            type="button"
            onClick={onNewInvestigation}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_24px_rgba(124,92,255,0.3)] hover:shadow-[0_0_30px_rgba(124,92,255,0.45)] transition-shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            new investigation
          </button>
        )}
      </div>

      {/* Primary nav */}
      <PrimaryNav collapsed={collapsed} onNavigate={onNavigate} />

      {/* Bottom — help + docs */}
      <div className="px-2 py-2 border-t border-border/40 space-y-0.5">
        <SidebarExternal
          href="mailto:hello@paidpilot.app"
          label="help"
          icon={HelpCircle}
          collapsed={collapsed}
        />
        <SidebarExternal
          href="/docs"
          label="docs"
          icon={BookOpen}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

/** Renders the primary nav rows. The tool rows (investigations / plays /
 *  calculators) point at the *active* campaign's scoped URL — they're
 *  rebuilt on every campaign switch. Active-state highlighting is
 *  computed off the URL pathname rather than NavLink's exact-match
 *  semantics, because `/projects/A/c/B/investigations` and
 *  `/projects/X/c/Y/investigations` both highlight the same row. */
function PrimaryNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const { activeProject, activeCampaign } = useActiveCampaign();
  const toolBase =
    activeProject && activeCampaign
      ? `/projects/${activeProject.id}/c/${activeCampaign.id}`
      : null;
  const nav = useMemo(() => buildNav(toolBase), [toolBase]);

  // Detect which tool surface (if any) we're currently inside. Hits both
  // the campaign-scoped path and the legacy /investigations|/plays|/calc
  // paths (which redirect, but may briefly render before resolution).
  const toolMatch =
    /^\/projects\/[^/]+\/c\/[^/]+\/(investigations|plays|calc)(\/|$)/.exec(pathname) ||
    /^\/(investigations|plays|calc)(\/|$)/.exec(pathname);
  const activeTool = toolMatch?.[1] ?? null;

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefixes?.length) {
      // tool row — only active when we're inside a matching tool surface
      return item.matchPrefixes.some(p =>
        activeTool === p.replace(/^\//, '') ||
        // map 'calculators' label → '/calc' route prefix
        (p === '/calc' && activeTool === 'calc'),
      );
    }
    if (item.to === '/projects') {
      // projects row — active on /projects[/:id[/c/:cid]] but NOT once
      // we descend into a tool sub-path (which lights up the tool row).
      if (activeTool) return false;
      if (pathname === '/projects') return true;
      return /^\/projects\/[^/]+(\/c\/[^/]+)?\/?$/.test(pathname);
    }
    if (item.end) return pathname === item.to;
    return pathname === item.to || pathname.startsWith(item.to + '/');
  };

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-1.5 space-y-0.5">
      {nav.map(item => (
        <SidebarNavLink
          key={item.label}
          to={item.to}
          label={item.label}
          icon={item.icon}
          active={isActive(item)}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <RowWithTooltip label={label} collapsed={collapsed}>
      <Link
        to={to}
        onClick={onNavigate}
        className={clsx(
          'group flex items-center h-9 rounded-md text-body-sm font-medium transition-colors duration-150 relative',
          collapsed ? 'justify-center w-9 mx-auto' : 'gap-2.5 px-2.5',
          active
            ? 'text-fg bg-brand/5'
            : 'text-fg-subtle hover:text-fg hover:bg-surface-sunken/40',
        )}
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-brand" />
        )}
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    </RowWithTooltip>
  );
}

function SidebarExternal({
  href,
  label,
  icon: Icon,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <RowWithTooltip label={label} collapsed={collapsed}>
      <a
        href={href}
        onClick={onNavigate}
        className={clsx(
          'flex items-center h-9 rounded-md text-body-sm text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 transition-colors',
          collapsed ? 'justify-center w-9 mx-auto' : 'gap-2.5 px-2.5',
        )}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
        {!collapsed && <span className="truncate">{label}</span>}
      </a>
    </RowWithTooltip>
  );
}

/** Tooltip-on-hover wrapper. The collapsed sidebar's rows are 36px icons
 *  with the tooltip absolutely positioned to the right; on the expanded
 *  sidebar the wrapper passes through with no tooltip. */
function RowWithTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <div className="group relative">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-md border border-border/60 bg-surface-container-high text-body-sm text-fg whitespace-nowrap opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 delay-100 z-50"
      >
        {label}
      </span>
    </div>
  );
}

function CollapseChevron() {
  const { collapsed, toggleCollapsed } = useSidebar();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      onClick={toggleCollapsed}
      aria-label={collapsed ? 'expand sidebar' : 'collapse sidebar'}
      title={`${collapsed ? 'expand' : 'collapse'} sidebar  [`}
      className="absolute -right-3 top-1/2 -translate-y-1/2 grid place-items-center w-6 h-6 rounded-full bg-surface-container border border-border/60 text-fg-subtle hover:text-fg hover:bg-surface-container-high shadow-sm transition-opacity opacity-0 hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 z-10"
      style={{ opacity: 1 }}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
}

/** Hamburger button for the top nav — visible only below lg, opens the
 *  slide-over drawer. */
export function SidebarHamburger() {
  const { setDrawerOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-label="open menu"
      className="lg:hidden grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
    >
      <ChevronRight className="w-4 h-4 rotate-90" />
    </button>
  );
}
