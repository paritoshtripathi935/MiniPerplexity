/**
 * Right-side slide-over for creating or editing a campaign.
 *
 * Matches Surface 4 from STITCH_PROMPTS_H.md: 480px wide, dimmed backdrop
 * with backdrop-blur, sticky footer with archive (left) + save (right).
 * "starts_on" and "ends_on" are both optional and independently nullable —
 * we serialise the form's empty-string back to `null` so the PATCH endpoint
 * sees an explicit clear.
 */
import React, { useEffect, useState } from 'react';
import { X, Archive } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Button } from './ui/Button';
import { projectColor } from './ActiveCampaign';
import {
  archiveCampaign,
  createCampaign,
  updateCampaign,
  type CampaignInput,
  type CampaignSummary,
  type ProjectSummary,
} from '../services/api';

interface Props {
  project: ProjectSummary;
  /** null → "create new" mode; CampaignSummary → "edit existing" mode. */
  campaign: CampaignSummary | null;
  onClose: () => void;
  onSaved: () => void;
  /** Disables the archive button when this would be the only live
   *  campaign in the project (backend enforces this too, but the UI
   *  pre-empts so we don't even let them try). */
  liveCampaignCount: number;
}

const fieldCls =
  'w-full px-3 py-2 rounded-lg border border-border/60 bg-surface-sunken/40 text-body-sm text-fg placeholder:text-fg-subtle outline-none focus:border-brand/40';
const labelCls = 'block text-body-md font-medium text-fg mb-1.5';

export function CampaignDrawer({
  project,
  campaign,
  onClose,
  onSaved,
  liveCampaignCount,
}: Props) {
  const { getToken } = useAuth();
  const isEdit = campaign !== null;
  const color = projectColor(project.id);

  const [name, setName] = useState(campaign?.name ?? '');
  const [objective, setObjective] = useState(campaign?.objective ?? '');
  const [startsOn, setStartsOn] = useState(campaign?.starts_on ?? '');
  const [endsOn, setEndsOn] = useState(campaign?.ends_on ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Esc to close, lock body scroll while drawer is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting && !archiving) onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, submitting, archiving]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const payload: CampaignInput = {
        name: name.trim(),
        objective: objective.trim() || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
      };
      if (isEdit) {
        // PATCH: send only fields with explicit values, treating empty
        // string as null (clear). updateCampaign forwards everything.
        await updateCampaign(project.id, campaign!.id, payload, getToken);
      } else {
        await createCampaign(project.id, payload, getToken);
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'save failed');
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!isEdit || archiving || liveCampaignCount <= 1) return;
    setArchiving(true);
    setErr(null);
    try {
      await archiveCampaign(project.id, campaign!.id, getToken);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'archive failed');
      setArchiving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />
      <form
        onSubmit={submit}
        className="relative w-full max-w-[480px] h-full bg-surface-raised/95 backdrop-blur-md border-l border-border/60 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle mb-1.5 inline-flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
              {project.name}
            </p>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="campaign name"
              maxLength={120}
              className="w-full bg-transparent text-h2 font-display font-semibold text-fg placeholder:text-fg-subtle outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 shrink-0"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className={labelCls + ' mb-0'}>objective</label>
              <span className="font-mono text-[10px] text-fg-subtle">
                {objective.length} / 500
              </span>
            </div>
            <textarea
              value={objective}
              onChange={e => setObjective(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="what does success look like for this campaign? (optional)"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>date window</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-body-sm text-fg-subtle mb-1">starts on</p>
                <input
                  type="date"
                  value={startsOn}
                  onChange={e => setStartsOn(e.target.value)}
                  className={fieldCls}
                />
              </div>
              <div>
                <p className="text-body-sm text-fg-subtle mb-1">ends on</p>
                <input
                  type="date"
                  value={endsOn}
                  onChange={e => setEndsOn(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </div>
            <p className="text-body-sm text-fg-subtle mt-2">
              leave blank for ongoing campaigns.
            </p>
          </div>

          {isEdit && (
            <div className="rounded-xl border border-border/60 bg-surface-sunken/40 p-3 text-body-sm text-fg-muted">
              <div>
                created {new Date(campaign!.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              {campaign!.updated_at !== campaign!.created_at && (
                <div>
                  last updated {new Date(campaign!.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
          )}

          {err && (
            <div className="px-3 py-2 rounded-md bg-danger-subtle text-danger text-body-sm">
              {err}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between gap-3">
          {isEdit ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archiving || submitting || liveCampaignCount <= 1}
              title={
                liveCampaignCount <= 1
                  ? "can't archive the project's only live campaign"
                  : undefined
              }
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Archive className="w-3.5 h-3.5" />
              {archiving ? 'archiving…' : 'archive'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-fg-subtle hover:text-fg text-body-sm"
            >
              cancel
            </button>
          )}
          <Button variant="gradient" disabled={!name.trim() || submitting}>
            {submitting ? 'saving…' : isEdit ? 'save' : 'create campaign'}
          </Button>
        </div>
      </form>
    </div>
  );
}
