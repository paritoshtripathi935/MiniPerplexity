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
const ChatPage = lazy(() =>
  import('./pages/ChatPage').then(m => ({ default: m.ChatPage })),
);
const PlaysPage = lazy(() =>
  import('./pages/PlaysPage').then(m => ({ default: m.PlaysPage })),
);
const CalculatorsPage = lazy(() =>
  import('./pages/CalculatorsPage').then(m => ({ default: m.CalculatorsPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })),
);

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
