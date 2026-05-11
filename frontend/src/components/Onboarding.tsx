import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { getBrandProfile, putBrandProfile, type BrandProfile } from '../services/api';
import { Button } from './ui/Button';

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

const inputCls =
  'w-full px-3 py-2 rounded-md border border-border bg-surface text-body-sm placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';
const labelCls = 'block text-body-md font-medium mb-1.5 text-fg';

const TOTAL_STEPS = 4;

export function Onboarding({ onComplete }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [icp, setIcp] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [targetCac, setTargetCac] = useState('');
  const [targetRoas, setTargetRoas] = useState('');

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
        /* first-time user */
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken, isSignedIn]);

  const toggleChannel = (id: string) =>
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

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

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 backdrop-blur-sm">
        <div className="px-5 py-3 rounded-lg bg-surface border border-border text-body-sm text-fg-muted">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-xl rounded-xl bg-surface shadow-dialog border border-border">
        <button
          onClick={() => finish(true)}
          title="Skip"
          className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors"
          aria-label="Skip onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-1 mb-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={clsx(
                  'h-0.5 flex-1 rounded-full transition-colors duration-300',
                  i <= step ? 'bg-brand' : 'bg-border'
                )}
              />
            ))}
          </div>
          <p className="text-[11px] text-fg-subtle mb-5">
            Step {step + 1} of {TOTAL_STEPS} · skip anytime
          </p>

          {step === 0 && (
            <>
              <h2 className="font-display text-[20px] font-semibold tracking-tight mb-1">
                Welcome to PaidPilot
              </h2>
              <p className="text-body-sm text-fg-muted mb-5 leading-relaxed">
                A few quick questions so every chat is grounded in your brand. You can edit these later in Settings.
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Company name</label>
                  <input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Acme Tools"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Website <span className="text-fg-subtle font-normal">(optional)</span></label>
                  <input
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://acme.com"
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="font-display text-[20px] font-semibold tracking-tight mb-1">
                Who's your customer?
              </h2>
              <p className="text-body-sm text-fg-muted mb-5 leading-relaxed">
                One paragraph is enough. Roles, company size, geography, what they're trying to do.
              </p>
              <textarea
                value={icp}
                onChange={e => setIcp(e.target.value)}
                rows={5}
                placeholder="Operations leads at SMB ecom brands ($1–10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
                className={inputCls}
              />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-display text-[20px] font-semibold tracking-tight mb-1">
                Where do you run paid?
              </h2>
              <p className="text-body-sm text-fg-muted mb-5 leading-relaxed">
                Pick the channels you currently spend on. We'll bias recommendations toward these.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map(c => {
                  const on = channels.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleChannel(c.id)}
                      className={clsx(
                        'h-8 px-3 rounded-md text-body-md font-medium transition-colors duration-150',
                        on
                          ? 'bg-fg text-fg-inverted'
                          : 'bg-surface border border-border text-fg-muted hover:text-fg hover:bg-surface-sunken'
                      )}
                    >
                      {on && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-display text-[20px] font-semibold tracking-tight mb-1">
                Targets
              </h2>
              <p className="text-body-sm text-fg-muted mb-5 leading-relaxed">
                Roughly — used as a sanity check when you ask "is this number normal?"
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Target CAC ($)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={targetCac}
                    onChange={e => setTargetCac(e.target.value)}
                    placeholder="120"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Target ROAS (×)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    value={targetRoas}
                    onChange={e => setTargetRoas(e.target.value)}
                    placeholder="2.5"
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              leadingIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => finish(true)}>
                Skip for now
              </Button>
              {step < TOTAL_STEPS - 1 ? (
                <Button
                  variant="primary"
                  onClick={() => setStep(s => s + 1)}
                  trailingIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={() => finish(true)}
                  trailingIcon={<Check className="w-3.5 h-3.5" />}
                >
                  Finish
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
