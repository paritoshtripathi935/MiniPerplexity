import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Check, FolderKanban, Save } from 'lucide-react';
import { putBrandProfile, type BrandProfile } from '../services/api';
import { useBrandProfile, useCacheActions } from '../services/queries';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';
import {
  BrandProfileFormFields,
  emptyBrandProfileForm,
  type BrandProfileFormState,
} from '../components/BrandProfileFormFields';

interface Props {
  darkMode: boolean;
  onUpdate?: (p: BrandProfile) => void;
}

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

  const [form, setForm] = useState<BrandProfileFormState>(emptyBrandProfileForm);

  // Hydrate the form once the cached profile arrives. Guard re-hydration
  // so SWR revalidations don't overwrite the user's in-flight edits.
  const hydratedRef = React.useRef(false);
  useEffect(() => {
    if (!cachedProfile || hydratedRef.current) return;
    hydratedRef.current = true;
    setForm({
      companyName: cachedProfile.company_name ?? '',
      website: cachedProfile.website ?? '',
      icp: cachedProfile.icp_description ?? '',
      channels: cachedProfile.primary_channels ?? [],
      targetCac:
        cachedProfile.target_cac != null ? String(cachedProfile.target_cac) : '',
      targetRoas:
        cachedProfile.target_roas != null ? String(cachedProfile.target_roas) : '',
      voice: cachedProfile.voice_guidelines ?? '',
      campaigns: cachedProfile.current_campaigns_summary ?? '',
    });
  }, [cachedProfile]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const p = await putBrandProfile(
        {
          company_name: form.companyName.trim() || null,
          website: form.website.trim() || null,
          icp_description: form.icp.trim() || null,
          primary_channels: form.channels,
          target_cac: form.targetCac ? Number(form.targetCac) : null,
          target_roas: form.targetRoas ? Number(form.targetRoas) : null,
          voice_guidelines: form.voice.trim() || null,
          current_campaigns_summary: form.campaigns.trim() || null,
          mark_completed: true,
        },
        getToken,
      );
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
        subtitle="composed into the system prompt on every investigation — so answers cite the right channels, ICP, and targets. this edits your default project's profile."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6 space-y-5">
          <BrandProfileFormFields value={form} onChange={setForm} />

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
            <Button
              variant="gradient"
              onClick={save}
              loading={saving}
              leadingIcon={<Save className="w-3.5 h-3.5" />}
            >
              {saving ? 'saving' : 'save profile'}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Link
            to="/settings/projects"
            className="block rounded-2xl border border-brand/30 bg-brand/5 hover:bg-brand/10 transition-colors p-5"
          >
            <div className="flex items-start gap-3">
              <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/15 text-brand shrink-0">
                <FolderKanban className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-fg font-display font-semibold mb-1">
                  projects + campaigns
                </h3>
                <p className="text-body-sm text-fg-muted leading-relaxed">
                  manage multiple brands and campaign workstreams. each
                  project has its own brand profile.
                </p>
              </div>
            </div>
          </Link>

          <div className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-5 h-fit">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
              how it's used
            </p>
            <ul className="text-body-sm text-fg-muted space-y-2.5 leading-relaxed">
              <li>
                <span className="text-fg">every investigation</span> gets your
                brand context in the system prompt.
              </li>
              <li>
                <span className="text-fg">plays</span> personalise their output
                to your channels and ICP.
              </li>
              <li>
                <span className="text-fg">targets</span> sanity-check your "is
                this CAC normal?" questions.
              </li>
              <li>stored on Neon, scoped to your account. never shared.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
