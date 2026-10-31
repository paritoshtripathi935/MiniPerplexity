import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Link as RouterLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import LoginPage from './components/LoginPage';
import { Logo } from './components/Logo';
import { LandingPage } from './pages/LandingPage';
import { wakeupBackend } from './utils/api';

const AuthedShell = lazy(() => import('./AuthedShell'));
const DocsPage = lazy(() => import('./pages/DocsPage').then(m => ({ default: m.DocsPage })));

const Loading = () => (
  <div role="status" className="min-h-screen grid place-items-center text-[14px] text-fg-muted">
    Loading PaidPilot…
  </div>
);

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
            <span className="font-display text-[15px] font-semibold tracking-tight text-fg group-hover:text-primary transition-colors">
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

// Clerk keeps a `__client_uat` cookie (0 = signed out) on this domain. If no
// cookie says "signed in", render the public routes without waiting ~1-2s for
// Clerk to load; signed-in users still wait so they never see the landing flash.
function likelySignedOut() {
  const uats = [...document.cookie.matchAll(/(?:^|; )__client_uat(?:_[^=]*)?=([^;]*)/g)];
  return uats.every(m => !m[1] || m[1] === '0');
}

function App() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    wakeupBackend();
  }, []);

  let content;
  if (isSignedIn) {
    content = <Suspense fallback={<Loading />}><AuthedShell /></Suspense>;
  } else if (isLoaded || likelySignedOut()) {
    content = (
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
    );
  } else {
    content = <Loading />;
  }

  return <BrowserRouter>{content}</BrowserRouter>;
}

export default App;
