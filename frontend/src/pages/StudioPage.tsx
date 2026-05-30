/**
 * /projects/:projectId/c/:campaignId/studio — creative generation surface.
 *
 * Layout (post-Stitch redesign): sticky composer at the top, single
 * chronological timeline below. Each timeline row is a *batch* (one
 * generate run) — left rail carries the prompt + timestamp + chips,
 * right area carries the three tiles in a grid. Unsaved previews and
 * saved tiles share the same row, distinguished by chip treatment
 * (`PREVIEW` overlay + corner save/discard buttons vs `SAVED` chip).
 *
 * State model:
 *   - `activeBatch` — the most recent run; tracks its prompt + the
 *     storage keys of every preview that came back. Tiles in this
 *     batch can be in one of three states (preview / saving / saved)
 *     derived from whether the preview's storage_key has landed in
 *     `creatives` yet.
 *   - `creatives` — every saved creative for this campaign (source of
 *     truth for what's in the campaign library). Historic batches are
 *     computed from this list by grouping (prompt, time-window).
 *   - `previews` — the still-unsaved tiles in `activeBatch`. When the
 *     user clicks save on a preview the entry stays in `previews` so
 *     the tile keeps its position in the row; we render the SAVED
 *     state by checking `savedKeys`.
 *
 * Generate flow:
 *   1. Click generate → discard any leftover unsaved previews from the
 *      prior activeBatch (storage cleanup) → call /generate → populate
 *      `previews` + `activeBatch`.
 *   2. Per-tile save → /save-from-studio → mark storage_key in
 *      savedKeys + add the new Creative row to `creatives`. The tile
 *      visually flips to SAVED in place; the user can still see it
 *      next to the unsaved siblings in the same batch row.
 *   3. Per-tile discard → drop from `previews` + fire-and-forget
 *      storage delete.
 *   4. Older batches are read-only historic rows derived from
 *      `creatives` (newest-first, grouped by prompt + 60s window).
 */
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle,
  Bookmark,
  Check,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Repeat,
  Sparkles,
  Target,
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
  { id: '1:1', label: '1:1', hint: 'meta' },
  { id: '9:16', label: '9:16', hint: 'reels' },
  { id: '1.91:1', label: '1.91:1', hint: 'link' },
  { id: '4:5', label: '4:5', hint: 'portrait' },
];

const STYLES: { id: Style; label: string; description: string }[] = [
  { id: 'photo', label: 'photo', description: 'photorealistic product shots' },
  { id: 'illustration', label: 'illustration', description: 'flat vector / brand-coloured' },
  { id: 'minimal', label: 'minimal', description: 'lots of negative space' },
  { id: '3d', label: '3d', description: 'stylised render' },
];

/** Window inside which two saved rows are considered the same generation
 *  batch. The studio writes ~3 rows per click, all within a second or
 *  two; 60s gives plenty of buffer for slow Flux runs without collapsing
 *  truly separate-but-prompt-identical runs into one row. */
const BATCH_WINDOW_MS = 60 * 1000;

/* -------------------------------------------------------------------- */
/* Page                                                                  */
/* -------------------------------------------------------------------- */

export function StudioPage(_props: Props) {
  const { projectId = '', campaignId = '' } = useParams<{
    projectId: string;
    campaignId: string;
  }>();
  const { getToken, isSignedIn } = useAuth();

  // ----- Composer state
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [style, setStyle] = useState<Style | null>('photo');
  const [variants] = useState(3);
  const [bakeContext, setBakeContext] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Wall-clock elapsed seconds since the in-flight generate started.
  const [elapsed, setElapsed] = useState(0);
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

  // ----- Library + active batch state
  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [previews, setPreviews] = useState<StudioPreview[]>([]);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [activeBatch, setActiveBatch] = useState<{
    prompt: string;
    composed: string;
    baked: boolean;
    startedAt: Date;
  } | null>(null);

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

  /** Saved creatives that are NOT part of the current active batch.
   *  Used as the source for the historic-timeline grouping. The active
   *  batch's tiles render from `previews` (with state derived from
   *  savedKeys), so we exclude them here to avoid duplicate rows. */
  const historicCreatives = useMemo<Creative[]>(() => {
    if (!creatives) return [];
    const activeStorageKeys = new Set(previews.map(p => p.storage_key));
    // Studio-generated rows only; uploads stay on /creatives.
    return creatives.filter(
      c => !!c.prompt && !activeStorageKeys.has(c.storage_key),
    );
  }, [creatives, previews]);

  /** Group historic creatives into batches by (prompt, time-window).
   *  Rows are emitted newest-first to match the screenshot. */
  const historicBatches = useMemo(() => {
    if (historicCreatives.length === 0) return [];
    const sorted = [...historicCreatives].sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
    );
    type Batch = {
      id: string;
      prompt: string;
      ai_model: string | null;
      startedAt: Date;
      items: Creative[];
    };
    const batches: Batch[] = [];
    for (const c of sorted) {
      const cTime = new Date(c.uploaded_at).getTime();
      const last = batches[batches.length - 1];
      const fitsInLast =
        last &&
        last.prompt === c.prompt &&
        Math.abs(last.startedAt.getTime() - cTime) < BATCH_WINDOW_MS;
      if (fitsInLast) {
        last.items.push(c);
      } else {
        batches.push({
          id: c.id,
          prompt: c.prompt ?? '',
          ai_model: c.ai_model ?? null,
          startedAt: new Date(c.uploaded_at),
          items: [c],
        });
      }
    }
    return batches;
  }, [historicCreatives]);

  /* ---------------------------- Handlers ---------------------------- */

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

  async function runGenerate(overridePrompt?: string) {
    const effective = (overridePrompt ?? prompt).trim();
    if (generating || effective.length < 4) return;

    // Discard any leftover unsaved previews from the prior batch
    // (saved tiles in the prior batch are already in `creatives`).
    if (previews.length > 0) {
      const stale = previews
        .filter(p => !savedKeys.has(p.storage_key))
        .map(p => p.storage_key);
      if (stale.length > 0) {
        void discardStudioPreviews(projectId, campaignId, stale, getToken);
      }
    }
    setPreviews([]);
    setSavedKeys(new Set());

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
      setActiveBatch({
        prompt: effective,
        composed: resp.composed_prompt,
        baked: resp.context_baked,
        startedAt: new Date(),
      });
    } catch (e: any) {
      setErr(e?.message ?? 'generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    await runGenerate();
  }

  function handlePromptKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runGenerate();
    }
  }

  /** Save a single preview tile. Keeps the entry in `previews` so the
   *  tile stays in position within the active-batch row; the SAVED
   *  treatment is driven off the savedKeys set. */
  async function handleSave(p: StudioPreview) {
    if (savingKeys.has(p.storage_key) || savedKeys.has(p.storage_key)) return;
    setSavingKeys(prev => new Set(prev).add(p.storage_key));
    setErr(null);
    try {
      const { creatives: saved } = await saveStudioPreviews(
        projectId,
        campaignId,
        [p],
        getToken,
      );
      setCreatives(prev => {
        const incoming = saved[0];
        if (!incoming) return prev;
        const existing = (prev ?? []).filter(c => c.id !== incoming.id);
        return [incoming, ...existing];
      });
      setSavedKeys(prev => new Set(prev).add(p.storage_key));
    } catch (e: any) {
      setErr(e?.message ?? 'save failed');
    } finally {
      setSavingKeys(prev => {
        const next = new Set(prev);
        next.delete(p.storage_key);
        return next;
      });
    }
  }

  /** Discard a single preview. Saved tiles can't be discarded from the
   *  active batch — once saved, the row "graduates" into the historic
   *  library and is removed via the regular /creatives delete path. */
  function handleDiscard(p: StudioPreview) {
    if (savedKeys.has(p.storage_key)) return;
    setPreviews(prev => prev.filter(x => x.storage_key !== p.storage_key));
    void discardStudioPreviews(projectId, campaignId, [p.storage_key], getToken);
  }

  function handleReuse(promptText: string) {
    setPrompt(promptText);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------------------------- Render ---------------------------- */

  return (
    <>
      <PageHeader
        eyebrow="studio"
        title="generate creative."
        subtitle="describe a concept, refine style, and save high-performing ad variants to your library."
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

      {/* ---------------- Sticky composer ---------------- */}
      <StickyComposer
        prompt={prompt}
        setPrompt={setPrompt}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        style={style}
        setStyle={setStyle}
        bakeContext={bakeContext}
        setBakeContext={setBakeContext}
        generating={generating}
        suggesting={suggesting}
        elapsed={elapsed}
        err={err}
        onSubmit={handleGenerate}
        onSuggest={handleSuggest}
        onKeyDown={handlePromptKeyDown}
      />

      {/* ---------------- Timeline ---------------- */}
      <div className="mt-10 space-y-10">
        {(generating || previews.length > 0) && activeBatch && (
          <ActiveBatchRow
            inFlight={generating}
            variants={variants}
            previews={previews}
            savedKeys={savedKeys}
            savingKeys={savingKeys}
            activeBatch={activeBatch}
            onSave={handleSave}
            onDiscard={handleDiscard}
            onReuse={() => handleReuse(activeBatch.prompt)}
          />
        )}

        {creatives === null ? (
          <p className="text-body-sm text-fg-muted">loading…</p>
        ) : historicBatches.length === 0 && !generating && previews.length === 0 ? (
          <EmptyState />
        ) : (
          historicBatches.map(batch => (
            <HistoricBatchRow
              key={batch.id}
              batch={batch}
              projectId={projectId}
              campaignId={campaignId}
              onReuse={() => handleReuse(batch.prompt)}
            />
          ))
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* Sticky composer                                                       */
/* -------------------------------------------------------------------- */

function StickyComposer({
  prompt,
  setPrompt,
  aspectRatio,
  setAspectRatio,
  style,
  setStyle,
  bakeContext,
  setBakeContext,
  generating,
  suggesting,
  elapsed,
  err,
  onSubmit,
  onSuggest,
  onKeyDown,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (a: AspectRatio) => void;
  style: Style | null;
  setStyle: (s: Style | null) => void;
  bakeContext: boolean;
  setBakeContext: (v: boolean | ((prev: boolean) => boolean)) => void;
  generating: boolean;
  suggesting: boolean;
  elapsed: number;
  err: string | null;
  onSubmit: (e: FormEvent) => void;
  onSuggest: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <div className="sticky top-2 z-30">
      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-border/60 bg-surface-raised/95 backdrop-blur-xl p-4 space-y-3 shadow-2xl"
      >
        {/* Row 1 — brief eyebrow + suggest button on the left;
            char counter + kbd hint on the right. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
              brief
            </span>
            <button
              type="button"
              onClick={onSuggest}
              disabled={suggesting || generating}
              title={
                prompt.trim()
                  ? 'refine your draft using brand + campaign context'
                  : 'draft a prompt from this campaign'
              }
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-brand/30 bg-brand/5 text-brand text-[11px] font-medium hover:bg-brand/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="flex items-center gap-3 text-[11px] text-fg-subtle font-mono">
            <span>{prompt.length}/1000</span>
            <span className="hidden md:inline">
              <Kbd>⌘</Kbd>
              <span className="mx-0.5">+</span>
              <Kbd>↵</Kbd>
            </span>
          </div>
        </div>

        {/* Row 2 — textarea */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="describe the creative — concept, subject, mood…"
          rows={2}
          maxLength={1000}
          disabled={generating || suggesting}
          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-body-base text-fg placeholder:text-fg-subtle resize-none disabled:opacity-50"
        />

        {/* Row 3 — chips + toggle + generate */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-2">
            {/* Aspect ratios — segmented control */}
            <div className="inline-flex items-center p-0.5 bg-surface-sunken/40 rounded-md border border-border/40">
              {ASPECT_RATIOS.map(opt => {
                const active = opt.id === aspectRatio;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAspectRatio(opt.id)}
                    disabled={generating}
                    className={clsx(
                      'inline-flex items-center gap-1.5 h-7 px-2 rounded text-[11px] transition-colors disabled:opacity-50',
                      active
                        ? 'bg-brand/15 text-brand'
                        : 'text-fg-muted hover:text-fg',
                    )}
                    title={opt.hint}
                  >
                    <AspectGlyph ratio={opt.id} active={active} />
                    <span className="font-mono tabular-nums">{opt.label}</span>
                    <span className="text-[10px] text-fg-subtle hidden lg:inline">
                      {opt.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Style chips */}
            <div className="flex items-center gap-1">
              {STYLES.map(opt => {
                const active = opt.id === style;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(active ? null : opt.id)}
                    disabled={generating}
                    title={opt.description}
                    className={clsx(
                      'h-7 px-2 rounded-md text-[11px] border transition-colors disabled:opacity-50',
                      active
                        ? 'border-brand/40 bg-brand/10 text-brand'
                        : 'border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Context toggle */}
            <button
              type="button"
              onClick={() => setBakeContext(v => !v)}
              disabled={generating}
              aria-pressed={bakeContext}
              title={
                bakeContext
                  ? 'brand voice + campaign objective baked into the prompt — click to send a bare prompt'
                  : 'click to bake brand voice + campaign objective into the prompt'
              }
              className={clsx(
                'inline-flex items-center gap-2 h-7 px-2 rounded-md transition-colors disabled:opacity-50',
                bakeContext ? 'text-brand' : 'text-fg-subtle hover:text-fg',
              )}
            >
              {/* Switch glyph */}
              <span
                className={clsx(
                  'relative w-7 h-3.5 rounded-full border transition-colors',
                  bakeContext ? 'bg-brand/20 border-brand/40' : 'bg-surface-sunken/60 border-border/60',
                )}
              >
                <span
                  className={clsx(
                    'absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-all',
                    bakeContext ? 'right-0.5 bg-brand' : 'left-0.5 bg-fg-subtle',
                  )}
                />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider inline-flex items-center gap-1">
                <Target className="w-3 h-3" />
                brand {bakeContext ? 'on' : 'off'}
              </span>
            </button>

            <button
              type="submit"
              disabled={generating || prompt.trim().length < 4}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  rendering · {elapsed}s
                </>
              ) : (
                <>
                  generate
                  <Wand2 className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {err && (
          <p className="text-body-sm text-rose-300 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {err}
          </p>
        )}
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Timeline rows                                                         */
/* -------------------------------------------------------------------- */

function ActiveBatchRow({
  inFlight,
  variants,
  previews,
  savedKeys,
  savingKeys,
  activeBatch,
  onSave,
  onDiscard,
  onReuse,
}: {
  inFlight: boolean;
  variants: number;
  previews: StudioPreview[];
  savedKeys: Set<string>;
  savingKeys: Set<string>;
  activeBatch: { prompt: string; composed: string; baked: boolean; startedAt: Date };
  onSave: (p: StudioPreview) => void;
  onDiscard: (p: StudioPreview) => void;
  onReuse: () => void;
}) {
  return (
    <TimelineRow
      timestamp="just now"
      isLive
      prompt={activeBatch.prompt}
      composed={activeBatch.composed}
      baked={activeBatch.baked}
      onReuse={onReuse}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {inFlight
          ? Array.from({ length: variants }).map((_, i) => <ShimmerTile key={i} />)
          : previews.map(p => (
              <PreviewTile
                key={p.storage_key}
                preview={p}
                saved={savedKeys.has(p.storage_key)}
                saving={savingKeys.has(p.storage_key)}
                onSave={() => onSave(p)}
                onDiscard={() => onDiscard(p)}
              />
            ))}
      </div>
    </TimelineRow>
  );
}

function HistoricBatchRow({
  batch,
  projectId,
  campaignId,
  onReuse,
}: {
  batch: { id: string; prompt: string; startedAt: Date; items: Creative[] };
  projectId: string;
  campaignId: string;
  onReuse: () => void;
}) {
  return (
    <TimelineRow
      timestamp={relativeTime(batch.startedAt)}
      prompt={batch.prompt}
      onReuse={onReuse}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {batch.items.map(c => (
          <SavedTile
            key={c.id}
            creative={c}
            projectId={projectId}
            campaignId={campaignId}
          />
        ))}
      </div>
    </TimelineRow>
  );
}

function TimelineRow({
  timestamp,
  isLive,
  prompt,
  composed,
  baked,
  onReuse,
  children,
}: {
  timestamp: string;
  isLive?: boolean;
  prompt: string;
  composed?: string;
  baked?: boolean;
  onReuse: () => void;
  children: React.ReactNode;
}) {
  const [composedOpen, setComposedOpen] = useState(false);
  return (
    <div className="flex gap-6">
      {/* Left rail */}
      <div className="w-36 shrink-0 pt-2 border-r border-border/40 pr-4 relative">
        <span
          aria-hidden
          className={clsx(
            'absolute -right-[5px] top-3 w-2 h-2 rounded-full',
            isLive ? 'bg-brand animate-pulse' : 'bg-border',
          )}
        />
        <p
          className={clsx(
            'font-mono text-[11px] uppercase tracking-[0.18em]',
            isLive ? 'text-brand' : 'text-fg-subtle',
          )}
        >
          {timestamp}
        </p>
        <p className="text-body-sm text-fg-muted leading-snug mt-2 line-clamp-4 italic">
          {prompt ? `"${prompt}"` : 'untitled prompt'}
        </p>
        <div className="mt-3 space-y-1.5">
          {baked && (
            <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded border border-brand/30 bg-brand/5 font-mono text-[9px] uppercase tracking-wider text-brand">
              <Target className="w-2.5 h-2.5" />
              context baked
            </span>
          )}
          {composed && (
            <button
              type="button"
              onClick={() => setComposedOpen(v => !v)}
              className="block font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:text-fg transition-colors"
            >
              {composedOpen ? 'hide composed' : 'sent to flux'}
            </button>
          )}
          <button
            type="button"
            onClick={onReuse}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-brand hover:underline"
          >
            <Repeat className="w-2.5 h-2.5" />
            re-run
          </button>
        </div>
        {composedOpen && composed && (
          <p className="mt-2 text-[11px] text-fg-muted font-mono break-words border-l border-border/40 pl-2">
            {composed}
          </p>
        )}
      </div>

      {/* Right area — tiles */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Tiles                                                                 */
/* -------------------------------------------------------------------- */

function PreviewTile({
  preview,
  saved,
  saving,
  onSave,
  onDiscard,
}: {
  preview: StudioPreview;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
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
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-surface-raised/40 transition-colors">
      <img
        src={preview.download_url}
        alt={preview.prompt}
        className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-[1.05]"
        loading="lazy"
      />

      {/* Top-right corner: circular action buttons (preview) or SAVED chip */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {saved ? (
          <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 backdrop-blur font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
            saved
          </span>
        ) : (
          <>
            <CircleActionBtn
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                if (!saving) onSave();
              }}
              title={saving ? 'saving…' : 'save'}
              accent="emerald"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </CircleActionBtn>
            <CircleActionBtn
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onDiscard();
              }}
              title="discard"
              accent="rose"
              disabled={saving}
            >
              <X className="w-4 h-4" />
            </CircleActionBtn>
          </>
        )}
      </div>

      {/* Full-tile dimmed overlay on hover — Stitch convention. Centered
          vertical buttons stack copy + download. */}
      <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2.5">
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? 'copied' : 'copy prompt'}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur font-mono text-[11px] uppercase font-bold text-fg-muted hover:text-fg hover:bg-brand/20 hover:border-brand/40 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'copied' : 'prompt'}
        </button>
        <a
          href={preview.download_url}
          download={preview.filename}
          onClick={e => e.stopPropagation()}
          title="download"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur font-mono text-[11px] uppercase font-bold text-fg-muted hover:text-fg hover:bg-brand/20 hover:border-brand/40 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          download
        </a>
      </div>
    </div>
  );
}

function SavedTile({
  creative,
  projectId,
  campaignId,
}: {
  creative: Creative;
  projectId: string;
  campaignId: string;
}) {
  const { getToken } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!creative.prompt) return;
    try {
      await navigator.clipboard.writeText(creative.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="group relative aspect-square overflow-hidden rounded-xl border border-border/40 bg-surface-raised/40 transition-colors">
      {previewErr ? (
        <div className="absolute inset-0 grid place-items-center text-fg-subtle">
          <AlertCircle className="w-4 h-4" />
        </div>
      ) : previewUrl ? (
        <img
          src={previewUrl}
          alt={creative.prompt || creative.filename}
          className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-[1.05]"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-fg-subtle">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 h-5 rounded-full border border-emerald-400/30 bg-emerald-400/10 backdrop-blur font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
        saved
      </span>

      {previewUrl && (
        <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'copied' : 'copy prompt'}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur font-mono text-[11px] uppercase font-bold text-fg-muted hover:text-fg hover:bg-brand/20 hover:border-brand/40 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'copied' : 'prompt'}
          </button>
          <a
            href={previewUrl}
            download={creative.filename}
            onClick={e => e.stopPropagation()}
            title="download"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 bg-surface-raised/80 backdrop-blur font-mono text-[11px] uppercase font-bold text-fg-muted hover:text-fg hover:bg-brand/20 hover:border-brand/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            download
          </a>
        </div>
      )}
    </div>
  );
}

function ShimmerTile() {
  return (
    <div className="aspect-square rounded-xl border border-border/40 bg-surface-raised/40 overflow-hidden relative">
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
  );
}

/** Circular action button (Stitch convention) — 32px round, semi-
 *  transparent semantic tint at rest, fills on hover. Used for the
 *  save (emerald) + discard (rose) affordances on preview tiles. */
function CircleActionBtn({
  children,
  onClick,
  title,
  accent,
  disabled,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  accent: 'emerald' | 'rose';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={clsx(
        'grid place-items-center w-8 h-8 rounded-full border backdrop-blur transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        accent === 'emerald'
          ? 'border-emerald-400/30 bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400 hover:text-white hover:border-emerald-400'
          : 'border-rose-400/30 bg-rose-400/20 text-rose-300 hover:bg-rose-400 hover:text-white hover:border-rose-400',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- */
/* Misc                                                                  */
/* -------------------------------------------------------------------- */

function EmptyState() {
  return (
    <div className="flex gap-6">
      <div className="w-36 shrink-0 pt-2 border-r border-border/40 pr-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          no batches
        </p>
      </div>
      <div className="flex-1 rounded-2xl border border-dashed border-border/60 px-6 py-12 text-center">
        <p className="text-body-base text-fg-muted">
          no generations yet for this campaign.
        </p>
        <p className="text-body-sm text-fg-subtle mt-1.5 max-w-md mx-auto">
          click <strong className="text-fg">suggest from campaign</strong> in the
          composer above for a starting prompt, or describe a concept and hit
          <strong className="text-fg">generate</strong>. three variants render
          in under 30 seconds.
        </p>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid place-items-center min-w-[16px] h-[16px] px-1 font-mono text-[10px] text-fg-muted bg-surface-sunken/60 border border-border/60 rounded align-middle">
      {children}
    </kbd>
  );
}

function AspectGlyph({ ratio, active }: { ratio: AspectRatio; active: boolean }) {
  const dims: Record<AspectRatio, { w: number; h: number }> = {
    '1:1': { w: 9, h: 9 },
    '9:16': { w: 6, h: 10 },
    '1.91:1': { w: 12, h: 6 },
    '4:5': { w: 8, h: 10 },
  };
  const { w, h } = dims[ratio];
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block rounded-[2px] border',
        active ? 'border-brand/60 bg-brand/20' : 'border-fg-subtle/40',
      )}
      style={{ width: `${w}px`, height: `${h}px` }}
    />
  );
}

function relativeTime(when: Date): string {
  const ms = Date.now() - when.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : when.toLocaleDateString();
}
