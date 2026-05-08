import React, { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { Calculator, Home, MessageSquare, Settings, Sparkles, Sun, Moon } from 'lucide-react';

interface Props {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/chat', label: 'Chat', icon: MessageSquare, end: false },
  { to: '/plays', label: 'Plays', icon: Sparkles, end: false },
  { to: '/calc', label: 'Calculators', icon: Calculator, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

/**
 * Sticky top nav + outlet for the routed pages. Pages render their own
 * page-specific chrome (sidebar, headings, etc.) below the nav.
 */
export function AppLayout({ darkMode, toggleDarkMode }: Props) {
  const location = useLocation();
  // The chat page manages its own scroll/footer; other pages get a normal page wrapper.
  const isChatRoute = location.pathname.startsWith('/chat');

  const shell = darkMode ? 'bg-gray-950 text-gray-100' : 'bg-gray-50 text-gray-900';
  const navBar = darkMode
    ? 'bg-gray-950/80 border-gray-800 backdrop-blur'
    : 'bg-white/80 border-gray-200 backdrop-blur';

  return (
    <div className={`min-h-screen flex flex-col ${shell}`}>
      <header className={`sticky top-0 z-40 border-b ${navBar}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <NavLink to="/" className="flex items-center gap-2 mr-4 shrink-0">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <span className="font-semibold tracking-tight">PaidPilot</span>
          </NavLink>

          <nav className="flex-1 flex items-center gap-1 overflow-x-auto">
            {NAV.map(item => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                      isActive
                        ? darkMode
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-900'
                        : darkMode
                          ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-900'
                          : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-md ${
                darkMode ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {isChatRoute ? (
        // Chat owns the full viewport below the nav (no max-width, no padding).
        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </main>
      )}
    </div>
  );
}

/** Container for page hero (title + description). */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm opacity-70 mt-1 max-w-2xl">{subtitle}</p>}
    </div>
  );
}
