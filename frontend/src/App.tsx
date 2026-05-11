import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import { AppLayout } from './components/AppLayout';
import { Onboarding } from './components/Onboarding';
import { HomePage } from './pages/HomePage';
import { ChatPage, type PendingPlay } from './pages/ChatPage';
import { PlaysPage } from './pages/PlaysPage';
import { CalculatorsPage } from './pages/CalculatorsPage';
import { SettingsPage } from './pages/SettingsPage';
import { getBrandProfile, type BrandProfile } from './services/api';
import { wakeupBackend } from './utils/api';

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
            path="chat"
            element={
              <ChatPage
                darkMode={darkMode}
                pending={pendingPlay}
                clearPending={() => setPendingPlay(null)}
              />
            }
          />
          <Route
            path="chat/:sessionId"
            element={
              <ChatPage
                darkMode={darkMode}
                pending={pendingPlay}
                clearPending={() => setPendingPlay(null)}
              />
            }
          />
          <Route
            path="plays"
            element={
              <PlaysPage
                darkMode={darkMode}
                onPrepareRun={(play, query, sessionId) =>
                  setPendingPlay({ play, query, sessionId })
                }
              />
            }
          />
          <Route path="calc" element={<CalculatorsPage darkMode={darkMode} />} />
          <Route
            path="settings"
            element={<SettingsPage darkMode={darkMode} onUpdate={p => setProfile(p)} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
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
