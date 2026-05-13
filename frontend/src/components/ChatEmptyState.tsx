import { useMemo, useState } from 'react';
import { Lightbulb, X, Youtube } from 'lucide-react';
import type { BrandProfile } from '../services/api';

/** localStorage key for the "videos surface here" tutorial nudge. Set to
 *  "1" once dismissed; that's the only signal — no per-investigation
 *  tracking, the tip is a one-time global hint. */
const VIDEOS_TIP_KEY = 'paidpilot-tip-videos-dismissed';

interface Starter {
  tag: string;
  prompt: string;
}

function starterPrompts(profile: BrandProfile | null): Starter[] {
  const channels = profile?.primary_channels ?? [];
  const channel = channels[0];
  const channelLabel: Record<string, string> = {
    meta: 'Meta',
    google: 'Google',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
  };
  const ch = channelLabel[channel] || 'Meta';

  const icpHook = profile?.icp_description ? '— for our ICP' : '';
  const company = profile?.company_name ? ` for ${profile.company_name}` : '';

  return [
    {
      tag: 'Benchmark',
      prompt: `What's a healthy CAC and ROAS range on ${ch} for SaaS in 2026? Cite sources.`,
    },
    {
      tag: 'Creative',
      prompt: `Give me 5 hook variants for a ${ch} ad ${icpHook}. Vary by emotion (curiosity, contrarian, FOMO, social proof, transformational).`,
    },
    {
      tag: 'Plan',
      prompt: `Draft a $50K/month channel plan${company}. Pick 2–3 channels, give a budget split with rationale and a KPI per slice.`,
    },
    {
      tag: 'Audit',
      prompt: `My ${ch} CAC has crept up 30% over the last 4 weeks despite refreshing creative. Walk me through the most likely causes, ranked.`,
    },
  ];
}

export function ChatEmptyState({
  profile,
  onPick,
}: {
  profile: BrandProfile | null;
  onPick: (text: string) => void;
}) {
  const starters = useMemo(() => starterPrompts(profile), [profile]);

  // One-time tutorial nudge pointing at the on-demand videos drawer
  // (PAI-14). Non-blocking, dismissable, remembered forever.
  const [showVideosTip, setShowVideosTip] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(VIDEOS_TIP_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const dismissVideosTip = () => {
    setShowVideosTip(false);
    try {
      window.localStorage.setItem(VIDEOS_TIP_KEY, '1');
    } catch {
      /* private mode / quota — in-memory dismissal is enough. */
    }
  };

  return (
    <div className="mt-16 sm:mt-24 animate-fade-in">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
        new investigation
      </p>
      <h2 className="font-display text-h1 sm:text-[28px] font-semibold tracking-tight text-fg">
        start by asking what changed, what to test, or what to scale.
      </h2>
      {profile?.company_name && (
        <p className="text-body-base text-fg-muted mt-2 max-w-xl leading-relaxed">
          working on {profile.company_name}. your brand context is applied automatically.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s.prompt)}
            className="group text-left rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur hover:border-brand/40 hover:bg-surface-raised/60 transition-colors duration-150 p-4 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-brand/80 mb-1.5">
              {s.tag.toLowerCase()}
            </div>
            <div className="text-body-sm text-fg leading-snug">{s.prompt}</div>
          </button>
        ))}
      </div>

      {showVideosTip && (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2.5"
        >
          <span className="grid place-items-center w-6 h-6 rounded-md bg-brand/15 text-brand shrink-0 mt-0.5">
            <Lightbulb className="w-3.5 h-3.5" />
          </span>
          <p className="flex-1 text-body-sm text-fg-muted leading-snug">
            tutorial videos surface automatically. when your investigation
            finds youtube content worth watching, look for the{' '}
            <span className="inline-flex items-baseline gap-1 align-baseline font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              <Youtube className="w-3 h-3 self-center" />
              videos
            </span>{' '}
            chip at the top of this chat.
          </p>
          <button
            type="button"
            onClick={dismissVideosTip}
            aria-label="dismiss tip"
            className="grid place-items-center w-6 h-6 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-raised/60 shrink-0 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <p className="text-[11px] text-fg-subtle mt-6">
        paste a URL in the composer to investigate that page specifically.
      </p>
    </div>
  );
}
