import React, { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Moon, Search, Sun } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ActiveCampaignProvider } from './ActiveCampaign';
import {
  AppSidebar,
  AppSidebarDrawer,
  SidebarHamburger,
  SidebarProvider,
} from './AppSidebar';
import { CampaignSwitcher } from './CampaignSwitcher';
import {
  CommandPalette,
  CommandPaletteProvider,
  useCommandPalette,
} from './CommandPalette';
import { CitationDrawer, CitationDrawerProvider } from './CitationDrawer';
import { Logo } from './Logo';

interface Props {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

/**
 * App shell: persistent sidebar on the left, slim top-nav with the
 * campaign switcher + utility actions on the right. Primary nav lives
 * in the sidebar (matches Stitch operator-tool design); the top bar is
 * reserved for global context (logo, campaign switcher) and tools
 * (⌘K, theme, avatar).
 */
export function AppLayout(props: Props) {
  return (
    <ActiveCampaignProvider>
      <SidebarProvider>
        <CommandPaletteProvider>
          <CitationDrawerProvider>
            <AppLayoutInner {...props} />
            <CommandPalette />
            <CitationDrawer />
          </CitationDrawerProvider>
        </CommandPaletteProvider>
      </SidebarProvider>
    </ActiveCampaignProvider>
  );
}

function AppLayoutInner({ darkMode, toggleDarkMode }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isInvestigationRoute = location.pathname.startsWith('/investigations');
  // Top-level route segment drives the page-enter key. We deliberately key
  // on the first segment so that nav within an investigation
  // (/investigations/abc → /investigations/def) doesn't re-trigger the
  // page-enter animation — only true page jumps do.
  const pageKey = location.pathname.split('/')[1] || 'home';
  const { setOpen: setPaletteOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // Sidebar's "+ new investigation" CTA — routes to a fresh investigations
  // path; ChatPage handles session-id minting on mount when none is given.
  const onNewInvestigation = () => navigate(`/investigations/${uuidv4()}`);

  return (
    <div className="min-h-screen flex flex-col bg-surface-sunken text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <div className="px-4 sm:px-6 lg:px-6 h-14 flex items-center gap-3">
          <SidebarHamburger />
          <a
            href="/"
            onClick={e => {
              e.preventDefault();
              navigate('/');
            }}
            className="flex items-center gap-2 mr-2 shrink-0"
          >
            <span className="grid place-items-center w-7 h-7 rounded-md bg-brand text-brand-fg">
              <Logo className="w-4 h-4" />
            </span>
            <span className="font-display font-semibold tracking-tight text-body-base hidden sm:inline">
              PaidPilot
            </span>
          </a>

          <CampaignSwitcher />

          <div className="flex-1" />

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors border border-border"
              aria-label="Open command palette"
              title="Open command palette"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-body-md">Search</span>
              <kbd className="inline-grid place-items-center min-w-[18px] h-[16px] px-1 text-[10px] font-medium text-fg-subtle bg-surface-sunken rounded">
                {isMac ? '⌘' : 'Ctrl'}
              </kbd>
              <kbd className="inline-grid place-items-center min-w-[18px] h-[16px] px-1 text-[10px] font-medium text-fg-subtle bg-surface-sunken rounded">
                K
              </kbd>
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="sm:hidden grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              aria-label="Open command palette"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={toggleDarkMode}
              className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: 'w-7 h-7' },
              }}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <AppSidebar onNewInvestigation={onNewInvestigation} />
        <AppSidebarDrawer onNewInvestigation={onNewInvestigation} />

        {isInvestigationRoute ? (
          <main key={pageKey} className="flex-1 min-h-0 motion-safe:animate-page-enter">
            <Outlet />
          </main>
        ) : (
          <main
            key={pageKey}
            className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 motion-safe:animate-page-enter"
          >
            <Outlet />
          </main>
        )}
      </div>
    </div>
  );
}

/** Page hero — title + description with consistent spacing. Matches the
 *  landing-page eyebrow/heading rhythm: small mono-uppercase tag, then a
 *  display-typography lowercase title. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-h1">
          {title}
        </h1>
        {subtitle && (
          <p className="text-body-base text-fg-muted mt-1.5 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
