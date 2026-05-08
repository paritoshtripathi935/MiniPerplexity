import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Save } from 'lucide-react';
import { getBrandProfile, putBrandProfile, type BrandProfile } from '../services/api';
import { PageHeader } from '../components/AppLayout';

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

export function SettingsPage({ darkMode, onUpdate }: Props) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [icp, setIcp] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [targetCac, setTargetCac] = useState<string>('');
  const [targetRoas, setTargetRoas] = useState<string>('');
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
        // First-load empty state — leave fields blank.
      } finally {
        setLoading(false);
      }
    })();
  }, [getToken]);

  const toggleChannel = (id: string) => {
    setChannels(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
  };

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

  const card = darkMode
    ? 'bg-gray-900 border-gray-800'
    : 'bg-white border-gray-200 shadow-sm';
  const subtle = darkMode ? 'text-gray-400' : 'text-gray-500';
  const inputCls = darkMode
    ? 'bg-gray-800 border-gray-700 placeholder-gray-500 text-gray-100'
    : 'bg-white border-gray-300 placeholder-gray-400 text-gray-900';

  if (loading) {
    return <p className={`text-sm ${subtle}`}>Loading…</p>;
  }

  return (
    <>
      <PageHeader
        title="Brand profile"
        subtitle="Composed into the system prompt for every chat — so answers cite the right channels, the right ICP, and the right targets."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={`lg:col-span-2 rounded-xl border p-5 sm:p-6 space-y-5 ${card}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company name</label>
              <input
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="e.g. Acme Tools"
                className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Website</label>
              <input
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://acme.com"
                className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">ICP — who you sell to</label>
            <textarea
              value={icp}
              onChange={e => setIcp(e.target.value)}
              rows={3}
              placeholder="e.g. Operations leads at SMB ecom brands ($1–10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
              className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Primary channels</label>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(c => {
                const on = channels.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Target CAC ($)</label>
              <input
                type="number"
                inputMode="decimal"
                value={targetCac}
                onChange={e => setTargetCac(e.target.value)}
                placeholder="120"
                className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
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
                className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Brand voice (optional)</label>
            <textarea
              value={voice}
              onChange={e => setVoice(e.target.value)}
              rows={2}
              placeholder="e.g. direct, lightly playful, never corporate. Avoid superlatives."
              className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Current campaigns (optional)</label>
            <textarea
              value={campaigns}
              onChange={e => setCampaigns(e.target.value)}
              rows={3}
              placeholder="e.g. Meta Advantage+ for SMB acquisition, Google brand + non-brand search, retargeting on Display."
              className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${inputCls}`}
            />
          </div>

          {error && (
            <div className="px-3 py-2 text-sm rounded bg-red-500/10 text-red-400">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            {savedAt && Date.now() - savedAt < 4000 && (
              <span className="text-xs text-emerald-500 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Saved
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </section>

        <aside className={`rounded-xl border p-5 ${card} h-fit`}>
          <h2 className="font-semibold mb-2">How this is used</h2>
          <ul className={`text-sm space-y-3 ${subtle}`}>
            <li>• <span className="opacity-90">Every chat</span> gets your brand context injected into the system prompt — no need to re-explain who you are.</li>
            <li>• <span className="opacity-90">Plays</span> personalise their output to your channels and ICP automatically.</li>
            <li>• <span className="opacity-90">Targets</span> are used as a sanity check when you ask "is this CAC normal?"</li>
            <li>• Stored on Neon, scoped to your Clerk account. Never shared.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
