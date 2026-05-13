/**
 * Brand-profile field set, shared between the legacy /settings page and
 * the per-project brand-profile tab in /settings/projects/:id.
 *
 * Owns no fetching / saving — pure controlled form. The parent owns
 * loading, dirty tracking, save invocation, and post-save invalidation.
 */
import React from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';

export const CHANNELS: { id: string; label: string }[] = [
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

export interface BrandProfileFormState {
  companyName: string;
  website: string;
  icp: string;
  channels: string[];
  targetCac: string;
  targetRoas: string;
  voice: string;
  campaigns: string;
}

export const emptyBrandProfileForm: BrandProfileFormState = {
  companyName: '',
  website: '',
  icp: '',
  channels: [],
  targetCac: '',
  targetRoas: '',
  voice: '',
  campaigns: '',
};

const fieldCls =
  'w-full px-3 py-2 rounded-control border border-border bg-surface text-body-sm text-fg placeholder:text-fg-subtle outline-none focus-visible:shadow-focus';
const labelCls = 'block text-body-md font-medium mb-1.5 text-fg';

interface Props {
  value: BrandProfileFormState;
  onChange: (next: BrandProfileFormState) => void;
  disabled?: boolean;
}

export function BrandProfileFormFields({ value, onChange, disabled }: Props) {
  const patch = (delta: Partial<BrandProfileFormState>) =>
    onChange({ ...value, ...delta });
  const toggleChannel = (id: string) =>
    patch({
      channels: value.channels.includes(id)
        ? value.channels.filter(c => c !== id)
        : [...value.channels, id],
    });

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>company name</label>
          <input
            value={value.companyName}
            onChange={e => patch({ companyName: e.target.value })}
            placeholder="Acme Tools"
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>website</label>
          <input
            value={value.website}
            onChange={e => patch({ website: e.target.value })}
            placeholder="https://acme.com"
            className={fieldCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>ICP — who you sell to</label>
        <textarea
          value={value.icp}
          onChange={e => patch({ icp: e.target.value })}
          rows={3}
          placeholder="operations leads at SMB ecom brands ($1–10M ARR), mostly US, looking to cut order-fulfilment cost without hiring."
          className={fieldCls}
        />
      </div>

      <div>
        <label className={labelCls}>primary channels</label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map(c => {
            const on = value.channels.includes(c.id);
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
            value={value.targetCac}
            onChange={e => patch({ targetCac: e.target.value })}
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
            value={value.targetRoas}
            onChange={e => patch({ targetRoas: e.target.value })}
            placeholder="2.5"
            className={fieldCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>
          brand voice{' '}
          <span className="text-fg-subtle font-normal">(optional)</span>
        </label>
        <textarea
          value={value.voice}
          onChange={e => patch({ voice: e.target.value })}
          rows={2}
          placeholder="direct, lightly playful, never corporate. avoid superlatives."
          className={fieldCls}
        />
      </div>

      <div>
        <label className={labelCls}>
          current campaigns{' '}
          <span className="text-fg-subtle font-normal">(optional)</span>
        </label>
        <textarea
          value={value.campaigns}
          onChange={e => patch({ campaigns: e.target.value })}
          rows={3}
          placeholder="Meta Advantage+ for SMB acquisition, Google brand + non-brand search, retargeting on Display."
          className={fieldCls}
        />
      </div>
    </fieldset>
  );
}
