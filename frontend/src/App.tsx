import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Link as RouterLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth, useClerk } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import { AppLayout } from './components/AppLayout';
import { useActiveCampaign } from './components/ActiveCampaign';
import { Logo } from './components/Logo';
import { Onboarding } from './components/Onboarding';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { getBrandProfile, type BrandProfile } from './services/api';
import { subscribeUnauthorized } from './services/authEvents';
import { preloadQueries } from './services/queries';
import { wakeupBackend } from './utils/api';
// Type-only import — types are erased at build time, no bundle cost.
import { type PendingPlay } from './pages/ChatPage';

// PAI-13 / PR H bundle pass: lazy-load the heavier routes so the home
// (most users' landing page) ships a smaller initial payload. ChatPage
// pulls in react-markdown, syntax-highlighter, the right rail, sessions
// sidebar — easily 100+ kB on its own. Calculators pulls 4 calc
// components plus the scenarios panel + compare. Plays + Settings are
// smaller but still split to keep route-level chunks consistent.
//
// We keep references to the raw import() promises so we can warm them
// in the background after first paint — avoids the Suspense flash
// (and clipped page-enter animation) on subsequent route changes.
const importChatPage = () => import('./pages/ChatPage');
const importPlaysPage = () => import('./pages/PlaysPage');
const importCalculatorsPage = () => import('./pages/CalculatorsPage');
const importSettingsPage = () => import('./pages/SettingsPage');
const importIntegrationsPage = () => import('./pages/IntegrationsPage');
const importProjectsListPage = () => import('./pages/ProjectsListPage');
const importProjectDetailPage = () => import('./pages/ProjectDetailPage');
const importCampaignHomePage = () => import('./pages/CampaignHomePage');
const importCreativesPage = () => import('./pages/CreativesPage');
const importDocsPage = () => import('./pages/DocsPage');
const importStudioPage = () => import('./pages/StudioPage');

const ChatPage = lazy(() => importChatPage().then(m => ({ default: m.ChatPage })));
const PlaysPage = lazy(() => importPlaysPage().then(m => ({ default: m.PlaysPage })));
const CalculatorsPage = lazy(() =>
  importCalculatorsPage().then(m => ({ default: m.CalculatorsPage })),
);
const SettingsPage = lazy(() =>
  importSettingsPage().then(m => ({ default: m.SettingsPage })),
);
const IntegrationsPage = lazy(() =>
  importIntegrationsPage().then(m => ({ default: m.IntegrationsPage })),
);
const ProjectsListPage = lazy(() =>
  importProjectsListPage().then(m => ({ default: m.ProjectsListPage })),
);
const ProjectDetailPage = lazy(() =>
  importProjectDetailPage().then(m => ({ default: m.ProjectDetailPage })),
);
const CampaignHomePage = lazy(() =>
  importCampaignHomePage().then(m => ({ default: m.CampaignHomePage })),
);
const CreativesPage = lazy(() =>
  importCreativesPage().then(m => ({ default: m.CreativesPage })),
);
const DocsPage = lazy(() => importDocsPage().then(m => ({ default: m.DocsPage })));
const StudioPage = lazy(() => importStudioPage().then(m => ({ default: m.StudioPage })));

/** Warm the lazy route chunks shortly after first paint. Runs once on
 * AppLayout mount; uses requestIdleCallback when available so it doesn't
 * compete with the home-page render. After this, every nav between
 * routes finds the chunk already resolved and the Suspense fallback
 * never paints — so the page-enter animation runs on real content. */
function preloadRouteChunks() {
  const warm = () => {
    importChatPage();
    importPlaysPage();
    importCalculatorsPage();
    importSettingsPage();
  };
  if (typeof window === 'undefined') return;
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  if (ric) ric(warm, { timeout: 2500 });
  else window.setTimeout(warm, 600);
}

/** Cross-route shared state lives here; pages get what they need via props. */
function AuthedShell() {
  const { getToken, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  // Global "backend rejected our bearer token" handler. Without this, a
  // 401 from any auth-required endpoint just gets swallowed by component-
  // level `.catch(() => null)` blocks, and the user ends up stuck on
  // surfaces that read "no data → first-time user" — the canonical
  // failure mode being the onboarding wizard locked on Step 1 with empty
  // fields. Signing out hard-resets Clerk's local session and bounces
  // the user back to /sign-in where they can re-authenticate.
  //
  // Skip the handler while signed out so a stray anonymous 401 (a guard
  // race during sign-out itself) doesn't loop.
  useEffect(() => {
    if (!isSignedIn) return;
    return subscribeUnauthorized(() => {
      // Fire-and-forget — signOut() handles its own promises. We want
      // to redirect immediately so the user sees the sign-in form
      // rather than the stuck UI.
      void signOut({ redirectUrl: '/sign-in' });
    });
  }, [isSignedIn, signOut]);
  // Initial theme: dark-first per PAI-13. Users who explicitly chose light
  // (stored as `paidpilot-theme=light`) keep their preference; everyone else
  // gets dark, regardless of OS preference. The operator-tool aesthetic is
  // dark-canonical — matching Linear, Vercel, Ramp.
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('paidpilot-theme') !== 'light';
  });

  // Sync .dark on <html> so Tailwind class-based dark variants (and our CSS
  // theme tokens) swap atomically.
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('paidpilot-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);

  // Warm the route chunks once first paint has settled. See preloadRouteChunks.
  useEffect(() => {
    preloadRouteChunks();
  }, []);

  // Seed the SWR cache for the shared queries (brand profile, sessions,
  // plays, me, plays history) shortly after first paint. By the time the
  // user navigates to any route, the data is already in cache — page
  // renders synchronously with no spinner. Public plays catalog runs
  // even when signed-out.
  useEffect(() => {
    preloadQueries(getToken, !!isSignedIn);
  }, [getToken, isSignedIn]);

  // Load brand profile so we know whether to show onboarding. (Independent
  // of SWR — we need the value imperatively here for the onboarding gate
  // before any route renders.)
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const p = await getBrandProfile(getToken);
        setProfile(p);
      } catch {
        // First-time user — server returns defaults; show onboarding.
      } finally {
        setProfileLoaded(true);
      }
    })();
  }, [isSignedIn, getToken]);

  const showOnboarding =
    profileLoaded && (profile === null || !profile.onboarding_completed);

  return (
    <>
      {showOnboarding && (
        <Onboarding darkMode={darkMode} onComplete={p => setProfile(p)} />
      )}
      <Routes>
        <Route element={<AppLayout darkMode={darkMode} toggleDarkMode={() => setDarkMode(d => !d)} />}>
          <Route index element={<HomePage darkMode={darkMode} />} />

          {/* Pre-#79-followup global tool routes: redirect to the active
              campaign's scoped equivalent. The URL is now the source of
              truth for tool scope; localStorage's role narrows to a
              navigation-chrome hint (sidebar / palette / home build
              hrefs from useActiveCampaign so they have somewhere to
              point when the user is outside a campaign URL). */}
          <Route path="investigations" element={<ToolRedirect tool="investigations" />} />
          <Route path="investigations/:sessionId" element={<ToolRedirect tool="investigations" />} />
          <Route path="plays" element={<ToolRedirect tool="plays" />} />
          <Route path="calc" element={<ToolRedirect tool="calc" />} />

          {/* Bookmark-preservation redirects for the pre-PAI-13 /chat paths. */}
          <Route path="chat" element={<ToolRedirect tool="investigations" />} />
          <Route path="chat/:sessionId" element={<ChatLegacyRedirect />} />

          <Route
            path="settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage darkMode={darkMode} onUpdate={p => setProfile(p)} />
              </Suspense>
            }
          />
          <Route
            path="settings/integrations"
            element={
              <Suspense fallback={null}>
                <IntegrationsPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="projects"
            element={
              <Suspense fallback={null}>
                <ProjectsListPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId"
            element={
              <Suspense fallback={null}>
                <ProjectDetailPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId"
            element={
              <Suspense fallback={null}>
                <CampaignHomePage darkMode={darkMode} />
              </Suspense>
            }
          />

          {/* Campaign-scoped tool routes — URL is fully authoritative for
              scope. ChatPage / PlaysPage / CalculatorsPage read campaignId
              from useParams; new-session creation passes it through so the
              session anchors to the right campaign on first turn. */}
          <Route
            path="projects/:projectId/c/:campaignId/investigations"
            element={
              <Suspense fallback={null}>
                <ChatPage
                  darkMode={darkMode}
                  pending={pendingPlay}
                  clearPending={() => setPendingPlay(null)}
                />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId/investigations/:sessionId"
            element={
              <Suspense fallback={null}>
                <ChatPage
                  darkMode={darkMode}
                  pending={pendingPlay}
                  clearPending={() => setPendingPlay(null)}
                />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId/plays"
            element={
              <Suspense fallback={null}>
                <PlaysPage
                  darkMode={darkMode}
                  onPrepareRun={(play, query, sessionId) =>
                    setPendingPlay({ play, query, sessionId })
                  }
                />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId/calc"
            element={
              <Suspense fallback={null}>
                <CalculatorsPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId/creatives"
            element={
              <Suspense fallback={null}>
                <CreativesPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="projects/:projectId/c/:campaignId/studio"
            element={
              <Suspense fallback={null}>
                <StudioPage darkMode={darkMode} />
              </Suspense>
            }
          />

          <Route
            path="docs"
            element={
              <Suspense fallback={null}>
                <DocsPage darkMode={darkMode} />
              </Suspense>
            }
          />

          {/* Bookmark-preservation redirects from the pre-restructure paths. */}
          <Route
            path="settings/projects"
            element={<Navigate to="/projects" replace />}
          />
          <Route
            path="settings/projects/:projectId"
            element={<LegacyProjectRedirect />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

/** Preserves the sessionId when bookmarks land on the legacy /chat/:id path. */
function ChatLegacyRedirect() {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/investigations/${sessionId}` : '/investigations'} replace />;
}

/** Redirects pre-#79-followup global tool routes (/investigations, /plays,
 *  /calc) into their campaign-scoped successors. When the user has no
 *  campaigns at all (brand-new account, no onboarding yet), routes to
 *  /projects so they pick a scope explicitly. Waits for the active-
 *  campaign resolution before navigating — otherwise a refresh on a
 *  legacy path would briefly redirect to /projects before flipping. */
function ToolRedirect({
  tool,
}: {
  tool: 'investigations' | 'plays' | 'calc';
}) {
  const { activeProject, activeCampaign, ready } = useActiveCampaign();
  const { sessionId } = useParams();
  if (!ready) return null;
  if (!activeProject || !activeCampaign) {
    return <Navigate to="/projects" replace />;
  }
  const base = `/projects/${activeProject.id}/c/${activeCampaign.id}/${tool}`;
  return (
    <Navigate to={sessionId ? `${base}/${sessionId}` : base} replace />
  );
}

/** Preserves the projectId when bookmarks land on /settings/projects/:id
 *  (pre-restructure path; now lives under /projects/:id). */
function LegacyProjectRedirect() {
  const { projectId } = useParams();
  return (
    <Navigate
      to={projectId ? `/projects/${projectId}` : '/projects'}
      replace
    />
  );
}

/** Thin public-access shell for routes that need to render without
 *  authentication. Renders a fixed top nav (logo + Docs label + Sign
 *  in CTA) so signed-out visitors don't land on a chrome-less page
 *  but also don't see the full SignedIn sidebar pointing at surfaces
 *  they can't access. Currently used for /docs only.
 */
function PublicDocsShell({ children }: { children: React.ReactNode }) {
  // Ensure dark theme on the public shell — signed-out users haven't
  // had a chance to set a preference, so we lean into the operator-
  // tool aesthetic by default.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
  }, []);

  return (
    <div className="min-h-screen bg-surface text-fg">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-surface/80 backdrop-blur-xl">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <RouterLink to="/" className="flex items-center gap-2.5 group">
            <span className="grid place-items-center w-7 h-7 rounded-md bg-brand text-brand-fg">
              <Logo className="w-3.5 h-3.5" />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight text-fg group-hover:text-brand transition-colors">
              PaidPilot
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle ml-1.5">
              docs
            </span>
          </RouterLink>
          <div className="flex items-center gap-2">
            <RouterLink
              to="/"
              className="hidden sm:inline-block text-[13px] text-fg-muted hover:text-fg transition-colors"
            >
              back to home
            </RouterLink>
            <RouterLink
              to="/sign-in"
              className="inline-flex items-center rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] px-3 h-8 text-[13px] font-medium text-white shadow-[0_0_16px_rgba(124,92,255,0.25)] hover:shadow-[0_0_22px_rgba(124,92,255,0.4)] transition-shadow"
            >
              sign in
            </RouterLink>
          </div>
        </div>
      </header>
      <main className="pt-6">{children}</main>
    </div>
  );
}

function App() {
  useEffect(() => {
    wakeupBackend();
  }, []);

  return (
    <BrowserRouter>
      <SignedOut>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in/*" element={<LoginPage />} />
          {/* /docs is public — accessible without an account. Renders
              inside a thin public shell instead of the full AppLayout
              so signed-out visitors don't see the sidebar/topnav for
              surfaces they can't access. */}
          <Route
            path="/docs"
            element={
              <PublicDocsShell>
                <Suspense fallback={null}>
                  <DocsPage darkMode={true} />
                </Suspense>
              </PublicDocsShell>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SignedOut>
      <SignedIn>
        <AuthedShell />
      </SignedIn>
    </BrowserRouter>
  );
}

export default App;
