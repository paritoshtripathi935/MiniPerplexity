import React, { useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { Github, Linkedin, Mail, Globe, X } from 'lucide-react';
import { Logo } from './Logo';

const developerData = {
  name: 'Paritosh Tripathi',
  links: [
    { icon: <Github className="w-4 h-4" />, url: 'https://github.com/paritoshtripathi935', label: 'GitHub', text: '@paritoshtripathi935' },
    { icon: <Linkedin className="w-4 h-4" />, url: 'https://www.linkedin.com/in/a-paritoshtripathi/', label: 'LinkedIn', text: 'Paritosh Tripathi' },
    { icon: <Mail className="w-4 h-4" />, url: 'mailto:paritosh.tripathi.work@gmail.com', label: 'Email', text: 'paritosh.tripathi.work@gmail.com' },
    { icon: <Globe className="w-4 h-4" />, url: 'http://paritoshtripathi.pythonanywhere.com/', label: 'Portfolio', text: 'Portfolio' },
  ],
};

const FEATURE_LIST = [
  'Sources weighted toward Meta &amp; Google docs, eMarketer, Adweek',
  '10 ready-to-run plays — briefs, channel plans, A/B specs',
  'Persistent chat history with full-text search',
  'Built-in calculators: CAC payback, ROAS-to-margin, sample size',
];

const LoginPage: React.FC = () => {
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="relative min-h-screen flex flex-col bg-surface text-fg overflow-hidden">
      {/* Replaces the floating particles — calmer, intentional. */}
      <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-[480px] bg-gradient-to-b from-brand-subtle/30 to-transparent pointer-events-none" />

      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-fg/40 backdrop-blur-sm" onClick={() => setShowContact(false)} />
          <div className="relative z-10 bg-surface rounded-xl shadow-dialog w-full max-w-md p-6 border border-border">
            <div className="flex justify-between items-center mb-5">
              <h2 className="font-display text-[16px] font-semibold tracking-tight">
                Reach the developer
              </h2>
              <button
                onClick={() => setShowContact(false)}
                className="grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[13px] text-fg-muted mb-5">{developerData.name}</p>
            <div className="space-y-1">
              {developerData.links.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-fg hover:bg-surface-sunken transition-colors"
                >
                  <span className="grid place-items-center w-7 h-7 rounded-md bg-surface-sunken text-fg-muted">
                    {link.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{link.label}</div>
                    <div className="text-[12px] text-fg-subtle truncate">{link.text}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-5xl mx-auto grid md:grid-cols-2 gap-10 items-center">
          {/* Pitch */}
          <div className="space-y-7">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand text-brand-fg shadow-card">
                <Logo className="w-5 h-5" />
              </span>
              <span className="font-display text-[20px] font-semibold tracking-tight">
                PaidPilot
              </span>
            </div>

            <div>
              <h1 className="font-display text-[36px] sm:text-[44px] leading-[1.05] tracking-[-0.02em] font-semibold">
                An operating system for growth teams.
              </h1>
              <p className="text-[15px] text-fg-muted mt-4 max-w-md leading-relaxed">
                Benchmarks, briefs, and channel plans without the Slack-and-search slog. Your brand context is baked into every answer. Free while in beta.
              </p>
            </div>

            <ul className="space-y-2.5 text-[14px] text-fg-muted max-w-md">
              {FEATURE_LIST.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-2 inline-block w-1 h-1 rounded-full bg-brand shrink-0" />
                  <span dangerouslySetInnerHTML={{ __html: line }} />
                </li>
              ))}
            </ul>

            <button
              onClick={() => setShowContact(true)}
              className="text-[13px] text-fg-muted hover:text-fg transition-colors"
            >
              Reach the developer →
            </button>
          </div>

          {/* Sign-in */}
          <div className="flex justify-center">
            <div className="w-full max-w-sm">
              <SignIn />
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border bg-surface/60 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-[12px] text-fg-subtle">
          <a
            href="https://github.com/paritoshtripathi935/MiniPerplexity"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg transition-colors"
          >
            Open-source on GitHub
          </a>
          <span className="mx-2">·</span>
          <span>Built by Paritosh Tripathi</span>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
