/**
 * First-run onboarding wizard (Category H / H6).
 *
 * Three-step flow per STITCH_PROMPTS_H.md Surface 5:
 *   1. Name your project (= brand)
 *   2. Brand context (the full brand-profile form)
 *   3. Your first campaign — "use general" OR "name a campaign" (with
 *      objective + optional date window)
 *
 * The default project + "General" campaign already exist for every user
 * (auto-created by the backend in `ensure_default_project_and_campaign`
 * on auth-upsert), so the wizard *renames + edits* them rather than
 * creating from scratch. Net result for the user: one project, one
 * campaign, both named the way they want.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, ArrowRight, Check, FolderKanban, Target, X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from './ui/Button';
import {
  BrandProfileFormFields,
  emptyBrandProfileForm,
  type BrandProfileFormState,
} from './BrandProfileFormFields';
import {
  getProjectBrandProfile,
  listCampaigns,
  listProjects,
  putProjectBrandProfile,
  renameProject,
  updateCampaign,
  type BrandProfile,
} from '../services/api';
import { QK, useCacheActions } from '../services/queries';
import { useSWRConfig } from 'swr';

interface Props {
  darkMode: boolean;
  /** Called with the saved profile once the wizard finishes. Parent uses
   *  it to flip the onboarding_completed gate so the modal stops rendering. */
  onComplete: (profile: BrandProfile) => void;
}

const TOTAL_STEPS = 3;

const inputCls =
  'w-full px-3 py-2 rounded-md border border-border bg-surface text-body-base text-fg placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';
const labelCls = 'block text-body-md font-medium mb-1.5 text-fg';

type CampaignChoice = 'general' | 'named';

export function Onboarding({ onComplete }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { setBrandProfile } = useCacheActions();
  const { mutate } = useSWRConfig();

  const [step, setStep] = useState(0);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Targets: the user's default project + that project's General campaign.
  // Resolved on mount; the wizard then mutates them in place.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generalCampaignId, setGeneralCampaignId] = useState<string | null>(null);

  // Step 1: project name (defaults to the project's current name, which
  // is "My Brand" for users with no company_name, or company_name for
  // users migrated by 007).
  const [projectName, setProjectName] = useState('');

  // Step 2: brand profile form.
  const [form, setForm] = useState<BrandProfileFormState>(emptyBrandProfileForm);

  // Step 3: campaign choice + (when named) fields.
  const [choice, setChoice] = useState<CampaignChoice>('general');
  const [campaignName, setCampaignName] = useState('');
  const [campaignObjective, setCampaignObjective] = useState('');
  const [campaignStarts, setCampaignStarts] = useState('');
  const [campaignEnds, setCampaignEnds] = useState('');

  // Hydrate: load the default project + its General campaign + existing
  // brand profile (which may already be partially populated from a prior
  // sign-in via the legacy endpoint).
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const projects = await listProjects(getToken);
        const project = projects[0];
        if (!project || cancelled) return;
        setProjectId(project.id);
        setProjectName(project.name);

        const [campaigns, profile] = await Promise.all([
          listCampaigns(project.id, getToken).catch(() => []),
          getProjectBrandProfile(project.id, getToken).catch(() => null),
        ]);
        if (cancelled) return;

        const general =
          campaigns.find(c => c.name.toLowerCase() === 'general' && !c.archived_at) ||
          campaigns.find(c => !c.archived_at) ||
          null;
        if (general) setGeneralCampaignId(general.id);

        if (profile) {
          setForm({
            companyName: profile.company_name ?? '',
            website: profile.website ?? '',
            icp: profile.icp_description ?? '',
            channels: profile.primary_channels ?? [],
            targetCac:
              profile.target_cac != null ? String(profile.target_cac) : '',
            targetRoas:
              profile.target_roas != null ? String(profile.target_roas) : '',
            voice: profile.voice_guidelines ?? '',
            campaigns: profile.current_campaigns_summary ?? '',
          });
        }
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  async function finish(skip: boolean) {
    if (!projectId) return;
    setSaving(true);
    setError(null);
    try {
      // 1. Rename project if changed (and skip=false).
      if (!skip && projectName.trim() && projectName.trim() !== '') {
        try {
          await renameProject(projectId, projectName.trim(), getToken);
        } catch (e: any) {
          // 409 = name taken; surface but don't abort the rest.
          if (e?.status !== 409) throw e;
        }
      }

      // 2. Save brand profile (always — even on skip, we persist
      //    onboarding_completed so the gate doesn't re-trigger).
      const profile = await putProjectBrandProfile(
        projectId,
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

      // 3. If they named a campaign, rename + edit the existing General
      //    campaign in place (keeps the project with exactly one campaign).
      if (!skip && choice === 'named' && generalCampaignId && campaignName.trim()) {
        await updateCampaign(
          projectId,
          generalCampaignId,
          {
            name: campaignName.trim(),
            objective: campaignObjective.trim() || null,
            starts_on: campaignStarts || null,
            ends_on: campaignEnds || null,
          },
          getToken,
        );
      }

      // Invalidate caches so the switcher + Settings pages pick up the
      // new names immediately.
      mutate(QK.projects);
      mutate(QK.campaigns(projectId));
      mutate(QK.brandProfile);

      // Bridge legacy /brand-profile cache so the AuthedShell onboarding
      // gate flips: it reads `profile.onboarding_completed`.
      setBrandProfile({
        user_id: '',
        company_name: profile.company_name,
        website: profile.website,
        icp_description: profile.icp_description,
        primary_channels: profile.primary_channels,
        target_cac: profile.target_cac,
        target_roas: profile.target_roas,
        voice_guidelines: profile.voice_guidelines,
        current_campaigns_summary: profile.current_campaigns_summary,
        onboarding_completed: profile.onboarding_completed,
      } as BrandProfile);

      onComplete({
        user_id: '',
        company_name: profile.company_name,
        website: profile.website,
        icp_description: profile.icp_description,
        primary_channels: profile.primary_channels,
        target_cac: profile.target_cac,
        target_roas: profile.target_roas,
        voice_guidelines: profile.voice_guidelines,
        current_campaigns_summary: profile.current_campaigns_summary,
        onboarding_completed: profile.onboarding_completed,
      } as BrandProfile);
    } catch (e: any) {
      setError(e?.message ?? 'save failed');
    } finally {
      setSaving(false);
    }
  }

  if (bootLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 backdrop-blur-sm">
        <div className="px-5 py-3 rounded-lg bg-surface border border-border text-body-sm text-fg-muted">
          loading…
        </div>
      </div>
    );
  }

  const canAdvanceStep1 = projectName.trim().length > 0;
  const canFinishStep3 =
    choice === 'general' || (choice === 'named' && campaignName.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-surface-raised border border-border/60 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)] max-h-[calc(100vh-2rem)] flex flex-col">
        <button
          onClick={() => finish(true)}
          title="skip"
          disabled={saving}
          className="absolute top-3 right-3 z-10 grid place-items-center w-7 h-7 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken transition-colors disabled:opacity-40"
          aria-label="skip onboarding"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 sm:p-8 overflow-y-auto">
          {/* Step indicator: three dots, current wider, completed filled. */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <span
                key={i}
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step
                    ? 'w-6 bg-brand'
                    : i < step
                    ? 'w-1.5 bg-fg-subtle'
                    : 'w-1.5 bg-border',
                )}
              />
            ))}
          </div>

          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2 text-center">
            {step === 0
              ? 'welcome to paidpilot · step 1 of 3'
              : `step ${step + 1} of 3`}
          </p>

          {step === 0 && (
            <Step1
              value={projectName}
              onChange={setProjectName}
              currentName={projectName}
            />
          )}

          {step === 1 && (
            <Step2 projectName={projectName} value={form} onChange={setForm} />
          )}

          {step === 2 && (
            <Step3
              choice={choice}
              setChoice={setChoice}
              campaignName={campaignName}
              setCampaignName={setCampaignName}
              campaignObjective={campaignObjective}
              setCampaignObjective={setCampaignObjective}
              campaignStarts={campaignStarts}
              setCampaignStarts={setCampaignStarts}
              campaignEnds={campaignEnds}
              setCampaignEnds={setCampaignEnds}
            />
          )}

          {error && (
            <div className="mt-4 px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
              {error}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-border/60 flex items-center justify-between gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            leadingIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => finish(true)}
              disabled={saving}
            >
              {step === 0 ? "i'll set this up later" : 'skip for now'}
            </Button>
            {step < TOTAL_STEPS - 1 ? (
              <Button
                variant="gradient"
                onClick={() => setStep(s => s + 1)}
                disabled={saving || (step === 0 && !canAdvanceStep1)}
                trailingIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                continue
              </Button>
            ) : (
              <Button
                variant="gradient"
                onClick={() => finish(false)}
                disabled={saving || !canFinishStep3}
                trailingIcon={<Check className="w-3.5 h-3.5" />}
              >
                {saving ? 'finishing…' : 'finish setup'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Steps                                                                 */
/* -------------------------------------------------------------------- */

function Step1({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
  currentName: string;
}) {
  return (
    <>
      <h2 className="font-display text-h1 font-semibold tracking-tight mb-2 mt-2">
        what brand are we working on?
      </h2>
      <p className="text-body-base text-fg-muted mb-6 leading-relaxed">
        every investigation is grounded in a brand context. you can add more
        brands later from settings.
      </p>
      <div>
        <label className={labelCls}>brand name</label>
        <input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Lumen Skincare"
          maxLength={120}
          className={inputCls}
        />
        <p className="text-body-sm text-fg-subtle mt-2">
          this is what we'll call your first project. usually your company
          name.
        </p>
      </div>
    </>
  );
}

function Step2({
  projectName,
  value,
  onChange,
}: {
  projectName: string;
  value: BrandProfileFormState;
  onChange: (next: BrandProfileFormState) => void;
}) {
  return (
    <>
      <h2 className="font-display text-h1 font-semibold tracking-tight mb-2 mt-2">
        tell us a bit about{' '}
        <span className="text-brand">{projectName || 'your brand'}</span>.
      </h2>
      <p className="text-body-base text-fg-muted mb-6 leading-relaxed">
        this grounds every answer paidpilot gives you.
      </p>
      <BrandProfileFormFields value={value} onChange={onChange} />
    </>
  );
}

function Step3({
  choice,
  setChoice,
  campaignName,
  setCampaignName,
  campaignObjective,
  setCampaignObjective,
  campaignStarts,
  setCampaignStarts,
  campaignEnds,
  setCampaignEnds,
}: {
  choice: CampaignChoice;
  setChoice: (c: CampaignChoice) => void;
  campaignName: string;
  setCampaignName: (s: string) => void;
  campaignObjective: string;
  setCampaignObjective: (s: string) => void;
  campaignStarts: string;
  setCampaignStarts: (s: string) => void;
  campaignEnds: string;
  setCampaignEnds: (s: string) => void;
}) {
  return (
    <>
      <h2 className="font-display text-h1 font-semibold tracking-tight mb-2 mt-2">
        what are you working on right now?
      </h2>
      <p className="text-body-base text-fg-muted mb-6 leading-relaxed">
        campaigns organise investigations by goal. start with whatever's on
        your plate this week — you can rename "general" later if nothing's
        active yet.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChoiceCard
          icon={<FolderKanban className="w-4 h-4" />}
          selected={choice === 'general'}
          onClick={() => setChoice('general')}
          title="use general"
          subtitle="a catch-all space for anything that doesn't fit a specific campaign."
        />
        <ChoiceCard
          icon={<Target className="w-4 h-4" />}
          selected={choice === 'named'}
          onClick={() => setChoice('named')}
          title="name a campaign"
          subtitle="define a specific objective and optional date window."
        />
      </div>

      {choice === 'named' && (
        <div className="mt-5 space-y-4 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <div>
            <label className={labelCls}>campaign name</label>
            <input
              autoFocus
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Q4 holiday push"
              maxLength={120}
              className={inputCls}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className={labelCls + ' mb-0'}>objective</label>
              <span className="font-mono text-[10px] text-fg-subtle">
                {campaignObjective.length} / 500
              </span>
            </div>
            <textarea
              value={campaignObjective}
              onChange={e =>
                setCampaignObjective(e.target.value.slice(0, 500))
              }
              rows={3}
              placeholder="what does success look like? (optional)"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>starts on</label>
              <input
                type="date"
                value={campaignStarts}
                onChange={e => setCampaignStarts(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>ends on</label>
              <input
                type="date"
                value={campaignEnds}
                onChange={e => setCampaignEnds(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <p className="text-body-sm text-fg-subtle">
            leave blank for ongoing campaigns.
          </p>
        </div>
      )}
    </>
  );
}

function ChoiceCard({
  icon,
  selected,
  onClick,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left rounded-2xl border p-4 transition-colors',
        selected
          ? 'border-brand/40 bg-brand/5 ring-1 ring-brand/30'
          : 'border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={clsx(
            'grid place-items-center w-7 h-7 rounded-lg',
            selected ? 'bg-brand/15 text-brand' : 'bg-surface-sunken/40 text-fg-subtle',
          )}
        >
          {icon}
        </span>
        <span
          className={clsx('font-display font-semibold text-body-base', selected ? 'text-fg' : 'text-fg-muted')}
        >
          {title}
        </span>
        {selected && (
          <span className="ml-auto grid place-items-center w-4 h-4 rounded-full bg-brand/15 text-brand">
            <Check className="w-3 h-3" />
          </span>
        )}
      </div>
      <p className="text-body-sm text-fg-muted leading-relaxed">{subtitle}</p>
    </button>
  );
}
