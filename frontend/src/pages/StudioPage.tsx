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
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Repeat,
  Save,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import {
  discardStudioPreviews,
  generateCreatives,
  getCreativeDownloadUrl,
  listCreatives,
  saveStudioPreviews,
  suggestStudioPrompt,
  type Creative,
  type StudioGenerateRequest,
  type StudioPreview,
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
  /** When true, the server appends a distilled brand+campaign context
   *  phrase to the prompt before calling Flux. Default ON because most
   *  marketers will want generations to look on-brand by default; power
   *  users who want a bare prompt flip it off. */
  const [bakeContext, setBakeContext] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Wall-clock seconds since generation started — drives the "rendering…"
   *  label on the gradient button so the user sees progress on the 8-15s
   *  Flux call instead of a frozen spinner. */
  const [elapsed, setElapsed] = useState(0);
  /** The composed prompt for the in-flight or most-recent run. Lets us
   *  show "this is what we sent" once the response comes back, so the
   *  user can debug surprises without guessing at the modifiers. */
  const [lastComposed, setLastComposed] = useState<{ prompt: string; baked: boolean } | null>(null);

  // Wall-clock progress ticker — only runs while generating.
  useEffect(() => {
    if (!generating) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => window.clearInterval(id);
  }, [generating]);

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

  // Un-persisted previews from the most recent generate run. Lives in
  // storage but no DB row yet — user must save explicitly. Discarding
  // here fires the best-effort storage delete in the background. We
  // intentionally don't carry previews across navigations: leaving the
  // page implicitly discards everything in this zone (storage cleanup
  // is handled by a future sweep).
  const [previews, setPreviews] = useState<StudioPreview[]>([]);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

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

  async function runGenerate(overridePrompt?: string) {
    const effective = (overridePrompt ?? prompt).trim();
    if (generating || !effective || effective.length < 4) return;
    // Starting a new run discards any unsaved previews from the prior
    // run — same storage-cleanup contract as the user clicking
    // "discard all" explicitly. Keeps the review zone focused on the
    // most recent batch.
    if (previews.length > 0) {
      const stale = previews.map(p => p.storage_key);
      void discardStudioPreviews(projectId, campaignId, stale, getToken);
      setPreviews([]);
    }
    setGenerating(true);
    setErr(null);
    try {
      const resp = await generateCreatives(
        projectId,
        campaignId,
        {
          prompt: effective,
          aspect_ratio: aspectRatio,
          style: style ?? undefined,
          variants,
          bake_context: bakeContext,
        },
        getToken,
      );
      setPreviews(resp.previews);
      setLastComposed({ prompt: resp.composed_prompt, baked: resp.context_baked });
    } catch (e: any) {
      setErr(e?.message ?? 'generation failed');
    } finally {
      setGenerating(false);
    }
  }

  /** Persist one or more previews to the campaign library. Removes
   *  them from the review zone on success; on failure surfaces the
   *  error and leaves them in place for the user to retry. */
  async function handleSave(items: StudioPreview[]) {
    if (items.length === 0) return;
    const keys = new Set(items.map(p => p.storage_key));
    setSavingKeys(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      return next;
    });
    setErr(null);
    try {
      const { creatives: saved } = await saveStudioPreviews(
        projectId,
        campaignId,
        items,
        getToken,
      );
      // Merge into the recent grid (newest first, deduped).
      const savedIds = new Set(saved.map(c => c.id));
      setCreatives(prev => {
        const existing = (prev ?? []).filter(c => !savedIds.has(c.id));
        return [...saved, ...existing];
      });
      setLatestBatchIds(savedIds);
      // Drop the saved previews from the review zone.
      setPreviews(prev => prev.filter(p => !keys.has(p.storage_key)));
    } catch (e: any) {
      setErr(e?.message ?? 'save failed');
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        keys.forEach(k => next.delete(k));
        return next;
      });
    }
  }

  /** Drop a preview from the review zone + best-effort delete from
   *  storage. Fire-and-forget — the cleanup endpoint is a 204 either
   *  way and a residual orphan gets swept later. */
  function handleDiscard(items: StudioPreview[]) {
    if (items.length === 0) return;
    const keys = items.map(p => p.storage_key);
    setPreviews(prev => prev.filter(p => !keys.includes(p.storage_key)));
    void discardStudioPreviews(projectId, campaignId, keys, getToken);
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    await runGenerate();
  }

  /** Cmd/Ctrl+Enter from anywhere in the form submits. Standard pattern
   *  for "I'm typing in a textarea and want to commit". */
  function handlePromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runGenerate();
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
              onKeyDown={handlePromptKeyDown}
              placeholder="describe the creative — concept, subject, mood. e.g. 'a hero shot of our holiday gift bundle on a warm cream background, premium feel, soft window light' · or click suggest from campaign to draft one"
              rows={3}
              maxLength={1000}
              disabled={generating || suggesting}
              className="w-full px-3 py-2 rounded-md border border-border/60 bg-surface-sunken/40 text-body-base text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none transition-colors resize-none disabled:opacity-50"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-body-sm text-fg-subtle">
              <span>{prompt.length}/1000</span>
              <span className="hidden sm:inline">
                <Kbd>⌘</Kbd>
                <span className="mx-0.5">+</span>
                <Kbd>↵</Kbd>
                <span className="ml-1.5">to generate</span>
              </span>
            </div>
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
                        'inline-flex items-center gap-2 h-8 px-2.5 rounded-md text-body-sm transition-colors border disabled:opacity-50',
                        active
                          ? 'border-brand/40 bg-brand/10 text-brand'
                          : 'border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40',
                      )}
                      title={opt.hint}
                    >
                      <AspectGlyph ratio={opt.id} active={active} />
                      <span className="font-mono tabular-nums">{opt.label}</span>
                      <span className="text-fg-subtle text-[10px] hidden sm:inline">
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

          {/* Context-bake toggle. Affirmative ON state is brand-tinted
              (this is the recommended path); OFF state is neutral.
              Showing the toggle in the same chip register as aspect +
              style keeps the composer visually consistent. */}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
              context
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBakeContext(v => !v)}
                disabled={generating}
                className={clsx(
                  'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-body-sm transition-colors border disabled:opacity-50',
                  bakeContext
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40',
                )}
                title={
                  bakeContext
                    ? 'currently appending brand voice + campaign objective to every prompt — click to send a bare prompt instead'
                    : 'currently sending the prompt as-is — click to append brand voice + campaign objective'
                }
                aria-pressed={bakeContext}
              >
                <Target className="w-3.5 h-3.5" />
                {bakeContext ? 'brand + campaign on' : 'brand + campaign off'}
              </button>
              <span className="text-body-sm text-fg-subtle">
                {bakeContext
                  ? 'distilled brand voice and campaign objective are added to every generation'
                  : 'only your prompt + style + aspect go to flux'}
              </span>
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
                  rendering · {elapsed}s
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

        {/* "Here's what we sent to Flux" — surfaced after the most
            recent run so the user can see the modifiers we applied
            (style hint + aspect hint + brand context if baked). */}
        {lastComposed && !generating && (
          <ComposedPromptDisclosure
            composed={lastComposed.prompt}
            baked={lastComposed.baked}
          />
        )}

        {/* ---------------------- review previews ---------------------- */}
        {(generating || previews.length > 0) && (
          <section>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
                review · pick what to keep
              </h2>
              {previews.length > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                  {previews.length} preview{previews.length === 1 ? '' : 's'}
                </span>
              )}
              <span className="flex-1 h-px bg-border/40" aria-hidden />
              {previews.length > 1 && !generating && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSave(previews)}
                    disabled={savingKeys.size > 0}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-body-sm hover:bg-emerald-400/15 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    save all
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDiscard(previews)}
                    disabled={savingKeys.size > 0}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 text-fg-muted hover:text-rose-300 hover:border-rose-400/30 text-body-sm transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                    discard all
                  </button>
                </div>
              )}
            </div>

            {generating ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: variants }).map((_, i) => (
                  <ShimmerTile key={i} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {previews.map(p => (
                  <PreviewTile
                    key={p.storage_key}
                    preview={p}
                    saving={savingKeys.has(p.storage_key)}
                    onSave={() => handleSave([p])}
                    onDiscard={() => handleDiscard([p])}
                    onReuse={() => {
                      setPrompt(p.prompt);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        )}

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

          {creatives === null ? (
            <p className="text-body-sm text-fg-muted">loading…</p>
          ) : generated.length === 0 ? (
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
                  onReuse={p => {
                    setPrompt(p);
                    // Scroll the composer back into view so the user
                    // sees the textarea repopulate.
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
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
  onReuse,
}: {
  creative: Creative;
  highlight: boolean;
  projectId: string;
  campaignId: string;
  onReuse: (prompt: string) => void;
}) {
  const { getToken } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function handleCopyPrompt(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!creative.prompt) return;
    try {
      await navigator.clipboard.writeText(creative.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  }

  function handleReuse(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!creative.prompt) return;
    onReuse(creative.prompt);
  }

  return (
    <div
      className={clsx(
        'rounded-2xl border bg-surface-raised/40 backdrop-blur overflow-hidden transition-colors group',
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
        {/* Hover actions overlay — visible on the image area so they
            don't fight the prompt text below. */}
        {previewUrl && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <TileIconBtn
              onClick={handleCopyPrompt}
              title={copied ? 'copied' : 'copy prompt'}
              disabled={!creative.prompt}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </TileIconBtn>
            <TileIconBtn
              onClick={handleReuse}
              title="re-use prompt"
              disabled={!creative.prompt}
            >
              <Repeat className="w-3 h-3" />
            </TileIconBtn>
            <a
              href={previewUrl}
              download={creative.filename}
              onClick={e => e.stopPropagation()}
              title="download"
              className="grid place-items-center w-7 h-7 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
            >
              <Download className="w-3 h-3" />
            </a>
          </div>
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

/** Un-persisted preview tile. Stronger visual treatment than
 *  GeneratedTile because the user has an explicit decision to make
 *  here. Save (gradient-tinted) and Discard (neutral, hover-rose) are
 *  the two primary actions; reuse-prompt + download live behind the
 *  hover overlay alongside copy-prompt to mirror GeneratedTile. */
function PreviewTile({
  preview,
  saving,
  onSave,
  onDiscard,
  onReuse,
}: {
  preview: StudioPreview;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onReuse: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(preview.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border border-brand/40 bg-surface-raised/40 backdrop-blur overflow-hidden shadow-[0_0_24px_rgba(124,92,255,0.18)] group">
      <div className="aspect-square w-full bg-surface-sunken/60 relative">
        <img
          src={preview.download_url}
          alt={preview.prompt}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 h-5 rounded-md border border-brand/40 bg-brand/15 backdrop-blur font-mono text-[10px] uppercase tracking-wider text-brand">
          <Sparkles className="w-2.5 h-2.5" />
          preview · unsaved
        </span>
        {/* Hover overlay — copy + reuse + download. Save / discard
            sit in the persistent footer so the user always sees them. */}
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <TileIconBtn onClick={handleCopy} title={copied ? 'copied' : 'copy prompt'}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </TileIconBtn>
          <TileIconBtn onClick={e => { e.preventDefault(); e.stopPropagation(); onReuse(); }} title="re-use prompt">
            <Repeat className="w-3 h-3" />
          </TileIconBtn>
          <a
            href={preview.download_url}
            download={preview.filename}
            onClick={e => e.stopPropagation()}
            title="download"
            className="grid place-items-center w-7 h-7 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors"
          >
            <Download className="w-3 h-3" />
          </a>
        </div>
      </div>
      <div className="p-3 space-y-2.5">
        <p className="text-body-sm text-fg line-clamp-2 leading-snug" title={preview.prompt}>
          {preview.prompt}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-body-sm hover:bg-emerald-400/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                saving…
              </>
            ) : (
              <>
                <Save className="w-3 h-3" />
                save
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            title="discard"
            aria-label="discard"
            className="grid place-items-center w-8 h-8 rounded-md border border-border/60 text-fg-muted hover:text-rose-300 hover:border-rose-400/30 transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TileIconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="grid place-items-center w-7 h-7 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur text-fg-muted hover:text-fg hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
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
      <p className="text-body-sm text-fg-subtle mt-1 max-w-md mx-auto">
        click <strong className="text-fg">suggest from campaign</strong> for a starting prompt,
        or describe a concept above and hit <strong className="text-fg">generate</strong>.
        three variants render in under 30 seconds.
      </p>
    </div>
  );
}

/* -------- helpers ----------------------------------------------------- */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid place-items-center min-w-[18px] h-[18px] px-1 font-mono text-[10px] text-fg-muted bg-surface-sunken/60 border border-border/60 rounded align-middle">
      {children}
    </kbd>
  );
}

/** Small visual aspect-ratio glyph used inside the chip. Communicates
 *  "portrait vs landscape vs square" faster than the numeric ratio
 *  alone. Three width × height rules pick a rounded rect of the right
 *  proportion. */
function AspectGlyph({ ratio, active }: { ratio: AspectRatio; active: boolean }) {
  const dims: Record<AspectRatio, { w: number; h: number }> = {
    '1:1': { w: 10, h: 10 },
    '9:16': { w: 7, h: 12 },
    '1.91:1': { w: 14, h: 7 },
    '4:5': { w: 9, h: 11 },
  };
  const { w, h } = dims[ratio];
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block rounded-sm border',
        active ? 'border-brand/60 bg-brand/20' : 'border-fg-subtle/40',
      )}
      style={{ width: `${w}px`, height: `${h}px` }}
    />
  );
}

/** Disclosure under the composer that shows the final composed prompt
 *  for the most recent generation. Defaults closed; expanding it lets
 *  the user see exactly what we sent to Flux — invaluable when a
 *  generation surprises them. */
function ComposedPromptDisclosure({
  composed,
  baked,
}: {
  composed: string;
  baked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(composed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  }

  return (
    <details
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-2xl border border-border/60 bg-surface-sunken/30 backdrop-blur"
    >
      <summary className="cursor-pointer select-none flex items-center gap-2 px-4 py-2.5 text-fg-muted hover:text-fg transition-colors list-none [&::-webkit-details-marker]:hidden">
        <Wand2 className="w-3.5 h-3.5 text-brand/70" />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
          sent to flux
        </span>
        {baked && (
          <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md border border-brand/30 bg-brand/5 font-mono text-[10px] uppercase tracking-wider text-brand">
            <Target className="w-2.5 h-2.5" />
            context baked
          </span>
        )}
        <span className="ml-auto text-body-sm text-fg-subtle">
          {open ? 'hide' : 'show'}
        </span>
      </summary>
      <div className="px-4 pb-3 pt-1 space-y-2">
        <p className="text-body-sm text-fg leading-relaxed font-mono break-words">
          {composed}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    </details>
  );
}
