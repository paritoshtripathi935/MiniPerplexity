/**
 * /projects/:projectId/c/:campaignId/studio — creative generation surface.
 *
 * Studio is the *generator* — the campaign creatives library
 * (/creatives) is the *destination*. Generate here, view + re-use the
 * results in the library.
 *
 * One page, three zones:
 *   - prompt form (large composer + aspect-ratio + style chips)
 *   - in-flight indicator while Flux is running (typically 8-15s per run)
 *   - recent generations grid below, scoped to this campaign
 *
 * No new design primitives — same PageHeader / eyebrow / Section
 * vocabulary as Integrations / Settings / Project pages. Brand-violet
 * gradient stays the only CTA gradient (the Generate button).
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import {
  generateCreatives,
  getCreativeDownloadUrl,
  listCreatives,
  suggestStudioPrompt,
  type Creative,
  type StudioGenerateRequest,
} from '../services/api';

interface Props {
  darkMode: boolean;
}

type AspectRatio = NonNullable<StudioGenerateRequest['aspect_ratio']>;
type Style = NonNullable<StudioGenerateRequest['style']>;

const ASPECT_RATIOS: { id: AspectRatio; label: string; hint: string }[] = [
  { id: '1:1', label: '1:1', hint: 'meta feed' },
  { id: '9:16', label: '9:16', hint: 'stories · reels · tiktok' },
  { id: '1.91:1', label: '1.91:1', hint: 'meta link preview' },
  { id: '4:5', label: '4:5', hint: 'instagram portrait' },
];

const STYLES: { id: Style; label: string; description: string }[] = [
  { id: 'photo', label: 'photo', description: 'photorealistic product shots' },
  { id: 'illustration', label: 'illustration', description: 'flat vector / brand-coloured' },
  { id: 'minimal', label: 'minimal', description: 'lots of negative space' },
  { id: '3d', label: '3d', description: 'stylised render' },
];

/** Generated tile signature. The same `Creative` row carries everything
 *  we need — `prompt` distinguishes generated rows from uploaded ones. */
function isGenerated(c: Creative): boolean {
  return !!c.prompt;
}

export function StudioPage(_props: Props) {
  const { projectId = '', campaignId = '' } = useParams<{
    projectId: string;
    campaignId: string;
  }>();
  const { getToken, isSignedIn } = useAuth();

  // Form state
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [style, setStyle] = useState<Style | null>('photo');
  const [variants] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Pulls a fresh prompt draft from the backend, grounded in the
   *  campaign's brand profile + objective. Refines toward whatever the
   *  user has already typed (if anything). Surfaces errors via the
   *  same banner the generate flow uses — both failures are
   *  "non-blocking" (user can still write their own prompt). */
  async function handleSuggest() {
    if (suggesting || generating) return;
    setSuggesting(true);
    setErr(null);
    try {
      const { prompt: draft } = await suggestStudioPrompt(
        projectId,
        campaignId,
        prompt.trim() || null,
        getToken,
      );
      if (draft) setPrompt(draft);
    } catch (e: any) {
      setErr(e?.message ?? 'could not draft a prompt from campaign');
    } finally {
      setSuggesting(false);
    }
  }

  // Library state (scoped to this campaign — same fetch as /creatives)
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [latestBatchIds, setLatestBatchIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!isSignedIn || !projectId || !campaignId) return;
    try {
      const rows = await listCreatives(projectId, campaignId, getToken);
      setCreatives(rows);
    } catch (e: any) {
      setErr(e?.message ?? 'failed to load creatives');
    }
  }, [isSignedIn, projectId, campaignId, getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Filter to generated-only for the studio recents grid. Uploaded rows
  // stay visible on /creatives — no need to duplicate them here.
  const generated = useMemo(
    () => (creatives ?? []).filter(isGenerated),
    [creatives],
  );

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (generating || !prompt.trim()) return;
    setGenerating(true);
    setErr(null);
    try {
      const { creatives: fresh } = await generateCreatives(
        projectId,
        campaignId,
        { prompt: prompt.trim(), aspect_ratio: aspectRatio, style: style ?? undefined, variants },
        getToken,
      );
      // Optimistically merge: new rows on top, dedup by id.
      const freshIds = new Set(fresh.map(c => c.id));
      setCreatives(prev => {
        const existing = (prev ?? []).filter(c => !freshIds.has(c.id));
        return [...fresh, ...existing];
      });
      setLatestBatchIds(freshIds);
    } catch (e: any) {
      setErr(e?.message ?? 'generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="studio"
        title="generate creative."
        subtitle="render ad variants grounded in your campaign context. tiles save to the campaign creatives library; share or download from there."
        actions={
          <Link
            to={`/projects/${projectId}/c/${campaignId}/creatives`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            full library
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        }
      />

      <div className="space-y-8">
        {/* ----------------------------- composer ----------------------------- */}
        <form
          onSubmit={handleGenerate}
          className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-5 space-y-4"
        >
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label
                htmlFor="studio-prompt"
                className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80"
              >
                brief
              </label>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggesting || generating}
                title={
                  prompt.trim()
                    ? 'refine your draft using brand + campaign context'
                    : 'draft a prompt from this campaign'
                }
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-brand/30 bg-brand/5 text-brand text-body-sm hover:bg-brand/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggesting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    drafting…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    {prompt.trim() ? 'refine from campaign' : 'suggest from campaign'}
                  </>
                )}
              </button>
            </div>
            <textarea
              id="studio-prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="describe the creative — concept, subject, mood. e.g. 'a hero shot of our holiday gift bundle on a warm cream background, premium feel, soft window light' · or click suggest from campaign to draft one"
              rows={3}
              maxLength={1000}
              disabled={generating || suggesting}
              className="w-full px-3 py-2 rounded-md border border-border/60 bg-surface-sunken/40 text-body-base text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none transition-colors resize-none disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Aspect ratio */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
                aspect
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map(opt => {
                  const active = opt.id === aspectRatio;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAspectRatio(opt.id)}
                      disabled={generating}
                      className={clsx(
                        'h-8 px-2.5 rounded-md text-body-sm transition-colors border disabled:opacity-50',
                        active
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40',
                      )}
                      title={opt.hint}
                    >
                      <span className="font-mono tabular-nums">{opt.label}</span>
                      <span className="ml-2 text-fg-subtle text-[10px] hidden sm:inline">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Style */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
                style
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map(opt => {
                  const active = opt.id === style;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStyle(active ? null : opt.id)}
                      disabled={generating}
                      className={clsx(
                        'h-8 px-2.5 rounded-md text-body-sm transition-colors border disabled:opacity-50',
                        active
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40',
                      )}
                      title={opt.description}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {err && (
            <p className="text-body-sm text-rose-300 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {err}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-body-sm text-fg-muted">
              <span className="tabular-nums">{variants}</span> variants · saved to{' '}
              <Link
                to={`/projects/${projectId}/c/${campaignId}/creatives`}
                className="text-brand hover:underline"
              >
                campaign library
              </Link>
            </p>
            <button
              type="submit"
              disabled={generating || prompt.trim().length < 4}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  rendering…
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5" />
                  generate
                </>
              )}
            </button>
          </div>
        </form>

        {/* ----------------------------- recents ----------------------------- */}
        <section>
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
              recent generations
            </h2>
            {generated.length > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                {generated.length}
              </span>
            )}
            <span className="flex-1 h-px bg-border/40" aria-hidden />
          </div>

          {generating && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
              {Array.from({ length: variants }).map((_, i) => (
                <ShimmerTile key={i} />
              ))}
            </div>
          )}

          {creatives === null ? (
            <p className="text-body-sm text-fg-muted">loading…</p>
          ) : generated.length === 0 && !generating ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {generated.map(c => (
                <GeneratedTile
                  key={c.id}
                  creative={c}
                  highlight={latestBatchIds.has(c.id)}
                  projectId={projectId}
                  campaignId={campaignId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* -------- Tile (generated row) ----------------------------------------- */

function GeneratedTile({
  creative,
  highlight,
  projectId,
  campaignId,
}: {
  creative: Creative;
  highlight: boolean;
  projectId: string;
  campaignId: string;
}) {
  const { getToken } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState(false);

  // Lazy-fetch the presigned download URL only when the tile mounts —
  // matches CreativesPage's pattern (IntersectionObserver there; cheap
  // eager fetch here because the studio surface caps the visible set).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { download_url } = await getCreativeDownloadUrl(
          projectId,
          campaignId,
          creative.id,
          getToken,
        );
        if (!cancelled) setPreviewUrl(download_url);
      } catch {
        if (!cancelled) setPreviewErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [creative.id, projectId, campaignId, getToken]);

  return (
    <div
      className={clsx(
        'rounded-2xl border bg-surface-raised/40 backdrop-blur overflow-hidden transition-colors',
        highlight
          ? 'border-brand/40 shadow-[0_0_24px_rgba(124,92,255,0.18)]'
          : 'border-border/60 hover:border-brand/30',
      )}
    >
      <div className="aspect-square w-full bg-surface-sunken/60 relative">
        {previewErr ? (
          <div className="absolute inset-0 grid place-items-center text-fg-subtle">
            <AlertCircle className="w-4 h-4" />
          </div>
        ) : previewUrl ? (
          <img
            src={previewUrl}
            alt={creative.prompt || creative.filename}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-fg-subtle">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
        {highlight && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 h-5 rounded-md border border-brand/40 bg-brand/15 backdrop-blur font-mono text-[10px] uppercase tracking-wider text-brand">
            <Sparkles className="w-2.5 h-2.5" />
            just now
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-body-sm text-fg line-clamp-2 leading-snug" title={creative.prompt || undefined}>
          {creative.prompt || creative.filename}
        </p>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-fg transition-colors"
          >
            open full size
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function ShimmerTile() {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface-raised/40 overflow-hidden">
      <div className="aspect-square w-full bg-surface-sunken/60 relative overflow-hidden">
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgb(var(--fg-subtle) / 0.08) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div className="absolute inset-0 grid place-items-center text-fg-subtle">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="h-3 bg-surface-sunken/60 rounded w-3/4" />
        <div className="h-3 bg-surface-sunken/60 rounded w-1/2" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 px-6 py-10 text-center">
      <ImageIcon className="w-6 h-6 text-fg-subtle mx-auto mb-2" />
      <p className="text-body-base text-fg-muted">
        no generations yet for this campaign.
      </p>
      <p className="text-body-sm text-fg-subtle mt-1">
        describe a creative concept above and hit <strong className="text-fg">generate</strong> —
        three variants render in under 30 seconds.
      </p>
    </div>
  );
}
