import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Save } from 'lucide-react';
import clsx from 'clsx';
import { putBrandProfile, type BrandProfile } from '../services/api';
import { useBrandProfile, useCacheActions } from '../services/queries';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';

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
  onUpdate?: (p: BrandProfile) => void;
}

const fieldCls =
  'w-full px-3 py-2 rounded-control border border-border bg-surface text-body-sm text-fg placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';
const labelCls = 'block text-body-md font-medium mb-1.5 text-fg';

export function SettingsPage({ onUpdate }: Props) {
  const { getToken, isSignedIn } = useAuth();
  // Cached profile — instant on revisit. isLoading is only true on the
  // very first fetch when there's no cached value at all.
  const { data: cachedProfile, isLoading: loading } = useBrandProfile(
    getToken,
    !!isSignedIn,
  );
  const { setBrandProfile } = useCacheActions();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [icp, setIcp] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [targetCac, setTargetCac] = useState('');
  const [targetRoas, setTargetRoas] = useState('');
  const [voice, setVoice] = useState('');
  const [campaigns, setCampaigns] = useState('');

  // Hydrate the form whenever the cached profile arrives or changes.
  // SWR re-emits on revalidation, but we only seed each field if the
  // user hasn't started editing — guarded via the `dirty` ref below.
  const hydratedRef = React.useRef(false);
  useEffect(() => {
    if (!cachedProfile || hydratedRef.current) return;
    hydratedRef.current = true;
    setCompanyName(cachedProfile.company_name ?? '');
    setWebsite(cachedProfile.website ?? '');
    setIcp(cachedProfile.icp_description ?? '');
    setChannels(cachedProfile.primary_channels ?? []);
    setTargetCac(cachedProfile.target_cac != null ? String(cachedProfile.target_cac) : '');
    setTargetRoas(cachedProfile.target_roas != null ? String(cachedProfile.target_roas) : '');
    setVoice(cachedProfile.voice_guidelines ?? '');
    setCampaigns(cachedProfile.current_campaigns_summary ?? '');
  }, [cachedProfile]);

  const toggleChannel = (id: string) =>
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const p = await putBrandProfile(
        {
          company_name: companyName.trim() || null,
          website: website.trim() || null,
          icp_description: icp.trim() || null,
          primary_channels: channels,
          target_cac: targetCac ? Number(targetCac) : null,
          target_roas: targetRoas ? Number(targetRoas) : null,
          voice_guidelines: voice.trim() || null,
          current_campaigns_summary: campaigns.trim() || null,
          mark_completed: true,
        },
        getToken
      );
      // Optimistic cache update: write the new profile into SWR's cache
      // so HomePage / ChatPage / palette see it immediately on next mount.
      setBrandProfile(p);
      onUpdate?.(p);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-body-sm text-fg-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="brand profile."
        subtitle="composed into the system prompt on every investigation — so answers cite the right channels, ICP, and targets."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Acme Tools"
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>website</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>ICP — who you sell to</label>
            <textarea
              value={icp}
              onChange={e => setIcp(e.target.value)}
              rows={3}
              placeholder="operations leads at SMB ecom brands ($1–10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>primary channels</label>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map(c => {
                const on = channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChannel(c.id)}
                    className={clsx(
                      'h-8 px-3 rounded-control text-body-md font-medium transition-colors',
                      on
                        ? 'bg-brand/15 text-fg border border-brand/40'
                        : 'bg-surface border border-border text-fg-muted hover:text-fg hover:border-border-strong',
                    )}
                  >
                    {on && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>target CAC ($)</label>
              <input
                type="number"
                inputMode="decimal"
                value={targetCac}
                onChange={e => setTargetCac(e.target.value)}
                placeholder="120"
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>target ROAS (×)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={targetRoas}
                onChange={e => setTargetRoas(e.target.value)}
                placeholder="2.5"
                className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>brand voice <span className="text-fg-subtle font-normal">(optional)</span></label>
            <textarea
              value={voice}
              onChange={e => setVoice(e.target.value)}
              rows={2}
              placeholder="direct, lightly playful, never corporate. avoid superlatives."
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>current campaigns <span className="text-fg-subtle font-normal">(optional)</span></label>
            <textarea
              value={campaigns}
              onChange={e => setCampaigns(e.target.value)}
              rows={3}
              placeholder="Meta Advantage+ for SMB acquisition, Google brand + non-brand search, retargeting on Display."
              className={fieldCls}
            />
          </div>

          {error && (
            <div className="px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            {savedAt && Date.now() - savedAt < 4000 && (
              <span className="text-body-md text-success inline-flex items-center gap-1">
                <Check className="w-3 h-3" /> saved
              </span>
            )}
            <Button variant="gradient" onClick={save} loading={saving} leadingIcon={<Save className="w-3.5 h-3.5" />}>
              {saving ? 'saving' : 'save profile'}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-5 h-fit">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
            how it's used
          </p>
          <ul className="text-body-sm text-fg-muted space-y-2.5 leading-relaxed">
            <li><span className="text-fg">every investigation</span> gets your brand context in the system prompt.</li>
            <li><span className="text-fg">plays</span> personalise their output to your channels and ICP.</li>
            <li><span className="text-fg">targets</span> sanity-check your "is this CAC normal?" questions.</li>
            <li>stored on Neon, scoped to your account. never shared.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
