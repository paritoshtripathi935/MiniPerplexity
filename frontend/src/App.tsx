import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import { AppLayout } from './components/AppLayout';
import { Onboarding } from './components/Onboarding';
import { HomePage } from './pages/HomePage';
import { getBrandProfile, type BrandProfile } from './services/api';
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

const ChatPage = lazy(() => importChatPage().then(m => ({ default: m.ChatPage })));
const PlaysPage = lazy(() => importPlaysPage().then(m => ({ default: m.PlaysPage })));
const CalculatorsPage = lazy(() =>
  importCalculatorsPage().then(m => ({ default: m.CalculatorsPage })),
);
const SettingsPage = lazy(() =>
  importSettingsPage().then(m => ({ default: m.SettingsPage })),
);

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

  // Load brand profile so we know whether to show onboarding.
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
          <Route
            path="investigations"
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
            path="investigations/:sessionId"
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
          {/* Bookmark-preservation redirects for the pre-PAI-13 /chat paths. */}
          <Route path="chat" element={<Navigate to="/investigations" replace />} />
          <Route
            path="chat/:sessionId"
            element={<ChatLegacyRedirect />}
          />
          <Route
            path="plays"
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
            path="calc"
            element={
              <Suspense fallback={null}>
                <CalculatorsPage darkMode={darkMode} />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={null}>
                <SettingsPage darkMode={darkMode} onUpdate={p => setProfile(p)} />
              </Suspense>
            }
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

function App() {
  useEffect(() => {
    wakeupBackend();
  }, []);

  return (
    <BrowserRouter>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <AuthedShell />
      </SignedIn>
    </BrowserRouter>
  );
}

export default App;
