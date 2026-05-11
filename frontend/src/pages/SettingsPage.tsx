import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Save } from 'lucide-react';
import clsx from 'clsx';
import { getBrandProfile, putBrandProfile, type BrandProfile } from '../services/api';
import { PageHeader } from '../components/AppLayout';
import { Card } from '../components/ui/Card';
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
  'w-full px-3 py-2 rounded-control border border-outline-variant bg-surface text-body-sm text-on-surface placeholder:text-outline outline-none focus-visible:shadow-focus';
const labelCls = 'block text-body-md font-medium mb-1.5 text-on-surface';

export function SettingsPage({ onUpdate }: Props) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    (async () => {
      try {
        const p = await getBrandProfile(getToken);
        setCompanyName(p.company_name ?? '');
        setWebsite(p.website ?? '');
        setIcp(p.icp_description ?? '');
        setChannels(p.primary_channels ?? []);
        setTargetCac(p.target_cac != null ? String(p.target_cac) : '');
        setTargetRoas(p.target_roas != null ? String(p.target_roas) : '');
        setVoice(p.voice_guidelines ?? '');
        setCampaigns(p.current_campaigns_summary ?? '');
      } catch {
        /* first-load empty */
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

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
        title="Brand profile"
        subtitle="Composed into the system prompt on every investigation — so answers cite the right channels, ICP, and targets."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Acme Tools"
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Website</label>
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
              placeholder="Operations leads at SMB ecom brands ($1–10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Primary channels</label>
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
                        ? 'bg-on-surface text-surface'
                        : 'bg-surface border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline',
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
              <label className={labelCls}>Target CAC ($)</label>
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
              <label className={labelCls}>Target ROAS (×)</label>
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
            <label className={labelCls}>Brand voice <span className="text-fg-subtle font-normal">(optional)</span></label>
            <textarea
              value={voice}
              onChange={e => setVoice(e.target.value)}
              rows={2}
              placeholder="Direct, lightly playful, never corporate. Avoid superlatives."
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Current campaigns <span className="text-fg-subtle font-normal">(optional)</span></label>
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
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
            <Button variant="primary" onClick={save} loading={saving} leadingIcon={<Save className="w-3.5 h-3.5" />}>
              {saving ? 'Saving' : 'Save profile'}
            </Button>
          </div>
        </Card>

        <Card className="p-5 h-fit">
          <h2 className="font-display font-semibold text-body-base tracking-tight mb-3">
            How this is used
          </h2>
          <ul className="text-body-sm text-on-surface-variant space-y-2.5 leading-relaxed">
            <li><span className="text-on-surface">Every investigation</span> gets your brand context in the system prompt.</li>
            <li><span className="text-on-surface">Plays</span> personalise their output to your channels and ICP.</li>
            <li><span className="text-on-surface">Targets</span> sanity-check your "is this CAC normal?" questions.</li>
            <li>Stored on Neon, scoped to your account. Never shared.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
