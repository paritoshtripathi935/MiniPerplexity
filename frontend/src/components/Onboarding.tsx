import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { getBrandProfile, putBrandProfile, type BrandProfile } from '../services/api';

const CHANNELS: { id: string; label: string }[] = [
  { id: 'meta', label: 'Meta' },
  { id: 'google', label: 'Google Ads' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'snap', label: 'Snap' },
  { id: 'programmatic', label: 'Programmatic' },
  { id: 'email', label: 'Email / lifecycle' },
  { id: 'seo', label: 'SEO' },
  { id: 'other', label: 'Other' },
];

interface Props {
  darkMode: boolean;
  onComplete: (profile: BrandProfile) => void;
}

/**
 * 4-step onboarding wizard. Skippable at any step (saves what's been
 * filled and marks onboarding_completed=true so we don't re-show it).
 */
export function Onboarding({ darkMode, onComplete }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [icp, setIcp] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [targetCac, setTargetCac] = useState<string>('');
  const [targetRoas, setTargetRoas] = useState<string>('');

  // Hydrate from any existing draft so a returning user can pick up where
  // they left off if they didn't finish onboarding.
  useEffect(() => {
    if (!isSignedIn) return;
    (async () => {
      try {
        const p = await getBrandProfile(getToken);
        setCompanyName(p.company_name ?? '');
        setWebsite(p.website ?? '');
        setIcp(p.icp_description ?? '');
        setChannels(p.primary_channels ?? []);
        setTargetCac(p.target_cac != null ? String(p.target_cac) : '');
        setTargetRoas(p.target_roas != null ? String(p.target_roas) : '');
      } catch {
        // First-time user — no profile row yet, that's fine.
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, isSignedIn]);

  const toggleChannel = (id: string) => {
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
  };

  const finish = async (markCompleted: boolean) => {
    setError(null);
    try {
      const profile = await putBrandProfile(
        {
          company_name: companyName.trim() || null,
          website: website.trim() || null,
          icp_description: icp.trim() || null,
          primary_channels: channels,
          target_cac: targetCac ? Number(targetCac) : null,
          target_roas: targetRoas ? Number(targetRoas) : null,
          mark_completed: markCompleted,
        },
        getToken
      );
      onComplete(profile);
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    }
  };

  const card = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';
  const input = darkMode
    ? 'bg-gray-800 border-gray-700 placeholder-gray-500'
    : 'bg-white border-gray-300 placeholder-gray-400';

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className={`px-6 py-4 rounded-lg ${card}`}>Loading…</div>
      </div>
    );
  }

  const totalSteps = 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`relative w-full max-w-xl rounded-2xl shadow-2xl ${card}`}>
        <button
          onClick={() => finish(true)}
          title="Skip"
          className={`absolute top-3 right-3 p-1 rounded ${subtle} hover:opacity-100`}
          aria-label="Skip onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  i <= step ? 'bg-blue-500' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <p className={`text-xs ${subtle} mb-4`}>
            Step {step + 1} of {totalSteps} · skip anytime
          </p>

          {step === 0 && (
            <>
              <h2 className="text-xl font-semibold mb-1">Welcome to PaidPilot 👋</h2>
              <p className={`${subtle} mb-5 text-sm`}>
                A few quick questions so every chat is grounded in your brand. You can edit these later.
              </p>
              <label className="block text-sm font-medium mb-1">Company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Tools"
                className={`w-full px-3 py-2 rounded-lg border outline-none mb-3 ${input}`}
              />
              <label className="block text-sm font-medium mb-1">Website (optional)</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                className={`w-full px-3 py-2 rounded-lg border outline-none ${input}`}
              />
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="text-xl font-semibold mb-1">Who's your customer?</h2>
              <p className={`${subtle} mb-5 text-sm`}>
                One paragraph is enough. Roles, company size, geography, what they're trying to do.
              </p>
              <textarea
                value={icp}
                onChange={e => setIcp(e.target.value)}
                rows={5}
                placeholder="e.g. Operations leads at SMB ecom brands ($1–$10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
                className={`w-full px-3 py-2 rounded-lg border outline-none ${input}`}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-xl font-semibold mb-1">Where do you run paid?</h2>
              <p className={`${subtle} mb-5 text-sm`}>
                Pick the channels you currently spend on. We'll bias recommendations toward these.
              </p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(c => {
                  const on = channels.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleChannel(c.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                        on
                          ? 'bg-blue-600 text-white border-blue-600'
                          : darkMode
                            ? 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                            : 'bg-white border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {on && <Check className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-xl font-semibold mb-1">Targets</h2>
              <p className={`${subtle} mb-5 text-sm`}>
                Roughly. Used as a sanity check when you ask "is this number normal?"
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Target CAC ($)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={targetCac}
                    onChange={e => setTargetCac(e.target.value)}
                    placeholder="120"
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${input}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target ROAS (×)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={targetRoas}
                    onChange={e => setTargetRoas(e.target.value)}
                    placeholder="2.5"
                    className={`w-full px-3 py-2 rounded-lg border outline-none ${input}`}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 px-3 py-2 text-sm rounded bg-red-500/10 text-red-400">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className={`inline-flex items-center gap-1 text-sm px-3 py-2 rounded-lg ${subtle} disabled:opacity-30`}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => finish(true)}
                className={`text-sm px-3 py-2 rounded-lg ${subtle}`}
              >
                Skip for now
              </button>
              {step < totalSteps - 1 ? (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => finish(true)}
                  className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                >
                  Finish <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
