/**
 * /projects/:projectId/c/:campaignId/creatives — per-campaign asset library.
 *
 * Upload PDFs + images, see them in a grid, click to preview / download,
 * X to delete. Browser uploads via presigned URL directly to the storage
 * provider (R2 today); the backend signs the URL + records the metadata
 * but never sees the bytes.
 *
 * Visual register: matches CampaignHomePage / IntegrationsPage —
 * rounded-2xl card, brand-tinted upload zone, simple thumbnail grid.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import {
  CREATIVE_ALLOWED_MIME,
  CREATIVE_MAX_BYTES,
  deleteCreative,
  getCreativeDownloadUrl,
  listCreatives,
  uploadCreative,
  type Creative,
} from '../services/api';

interface Props {
  darkMode: boolean;
}

export function CreativesPage(_props: Props) {
  const { projectId = '', campaignId = '' } = useParams<{
    projectId: string;
    campaignId: string;
  }>();
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();

  const [creatives, setCreatives] = useState<Creative[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!isSignedIn || !projectId || !campaignId) return;
    setErr(null);
    try {
      const rows = await listCreatives(projectId, campaignId, getToken);
      setCreatives(rows);
    } catch (e: any) {
      setErr(e?.message ?? 'failed to load creatives');
    }
  }, [getToken, isSignedIn, projectId, campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!projectId || !campaignId) return;
      setErr(null);
      setUploading(true);
      try {
        // Sequential to keep error attribution simple + respect any
        // future per-account rate limits. List grows fast enough at
        // 1-file-at-a-time UX speeds.
        for (const file of Array.from(files)) {
          try {
            const created = await uploadCreative(
              projectId,
              campaignId,
              file,
              getToken,
            );
            setCreatives(prev => (prev ? [created, ...prev] : [created]));
          } catch (e: any) {
            setErr(`${file.name}: ${e?.message ?? 'upload failed'}`);
          }
        }
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [projectId, campaignId, getToken],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDelete = async (c: Creative) => {
    if (!window.confirm(`Delete "${c.filename}"? This cannot be undone.`)) return;
    setErr(null);
    try {
      await deleteCreative(projectId, campaignId, c.id, getToken);
      setCreatives(prev => (prev ? prev.filter(x => x.id !== c.id) : prev));
      if (previewId === c.id) setPreviewId(null);
    } catch (e: any) {
      setErr(e?.message ?? 'delete failed');
    }
  };

  const handleDownload = async (c: Creative) => {
    try {
      const { download_url } = await getCreativeDownloadUrl(
        projectId,
        campaignId,
        c.id,
        getToken,
      );
      window.open(download_url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setErr(e?.message ?? 'download failed');
    }
  };

  const acceptAttr = useMemo(
    () => CREATIVE_ALLOWED_MIME.join(','),
    [],
  );
  const previewCreative = useMemo(
    () => (previewId ? creatives?.find(c => c.id === previewId) ?? null : null),
    [previewId, creatives],
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Link
              to={`/projects/${projectId}/c/${campaignId}`}
              className="text-brand/80 hover:text-brand inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" />
              back to campaign
            </Link>
          </span>
        }
        title="creatives."
        subtitle="upload pdfs + images for this campaign. they stay scoped to this campaign and aren't shared across the project."
      />

      <UploadZone
        dragOver={dragOver}
        uploading={uploading}
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setDragOver(true)}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      />
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple
        hidden
        onChange={e => {
          if (e.target.files) handleFiles(e.target.files);
        }}
      />

      {err && (
        <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-body-sm text-rose-200">
          {err}
        </div>
      )}

      <div className="mt-6">
        {creatives === null ? (
          <p className="text-body-sm text-fg-muted">loading…</p>
        ) : creatives.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-surface-raised/30 px-4 py-10 text-center">
            <p className="text-body-base text-fg-muted">no creatives uploaded yet.</p>
            <p className="text-body-sm text-fg-subtle mt-1">
              drop a pdf, png, or image above to get started.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {creatives.map(c => (
              <CreativeTile
                key={c.id}
                creative={c}
                projectId={projectId}
                campaignId={campaignId}
                onPreview={() => setPreviewId(c.id)}
                onDownload={() => handleDownload(c)}
                onDelete={() => handleDelete(c)}
              />
            ))}
          </ul>
        )}
      </div>

      {previewCreative && (
        <PreviewDrawer
          creative={previewCreative}
          projectId={projectId}
          campaignId={campaignId}
          getToken={getToken}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}

/* ----------------------------- Upload zone ------------------------------ */

function UploadZone({
  dragOver,
  uploading,
  onClick,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  dragOver: boolean;
  uploading: boolean;
  onClick: () => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      onClick={onClick}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      className={clsx(
        'rounded-2xl border-2 border-dashed transition-colors cursor-pointer p-8 text-center',
        dragOver
          ? 'border-brand/60 bg-brand/10'
          : 'border-border/60 bg-surface-raised/40 hover:border-brand/40 hover:bg-surface-raised/60',
      )}
    >
      <span className="grid place-items-center w-12 h-12 mx-auto rounded-xl bg-brand/15 text-brand mb-3">
        <Upload className="w-5 h-5" />
      </span>
      <p className="text-body-base text-fg">
        {uploading ? 'uploading…' : 'drop files here or click to browse'}
      </p>
      <p className="text-body-sm text-fg-subtle mt-1">
        pdf, png, jpg, webp, gif, svg · up to {CREATIVE_MAX_BYTES / 1024 / 1024} MB each
      </p>
    </div>
  );
}

/* ------------------------------- Tile ----------------------------------- */

function CreativeTile({
  creative,
  projectId,
  campaignId,
  onPreview,
  onDownload,
  onDelete,
}: {
  creative: Creative;
  projectId: string;
  campaignId: string;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const isImage = creative.mime_type.startsWith('image/');
  const isPdf = creative.mime_type === 'application/pdf';
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const { getToken } = useAuth();

  // Image previews need a presigned URL too — lazy-fetch on mount so
  // a page with 50 creatives doesn't generate 50 URLs upfront. SVGs
  // skip the presign (treated as inline icon) to keep large libraries
  // snappy; click-through preview still shows them.
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getCreativeDownloadUrl(projectId, campaignId, creative.id, getToken)
      .then(({ download_url }) => {
        if (!cancelled) setThumbUrl(download_url);
      })
      .catch(() => {
        /* swallow — tile falls back to the icon */
      });
    return () => {
      cancelled = true;
    };
  }, [creative.id, isImage, projectId, campaignId, getToken]);

  return (
    <li className="group rounded-xl border border-border/60 bg-surface-raised/40 overflow-hidden">
      <button
        type="button"
        onClick={onPreview}
        className="block w-full aspect-square bg-surface-sunken/40 hover:bg-surface-sunken/60 transition-colors relative"
      >
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={creative.filename}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-fg-subtle">
            {isPdf ? (
              <FileText className="w-10 h-10" strokeWidth={1.4} />
            ) : (
              <ImageIcon className="w-10 h-10" strokeWidth={1.4} />
            )}
          </span>
        )}
      </button>
      <div className="px-2.5 py-2 flex items-center gap-1.5">
        <span
          className="flex-1 min-w-0 text-body-sm text-fg truncate"
          title={creative.filename}
        >
          {creative.filename}
        </span>
        <button
          type="button"
          onClick={onDownload}
          aria-label="download"
          className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:text-fg hover:bg-surface-sunken/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="delete"
          className="grid place-items-center w-6 h-6 rounded text-fg-subtle hover:text-rose-300 hover:bg-surface-sunken/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

/* ----------------------------- Preview drawer --------------------------- */

function PreviewDrawer({
  creative,
  projectId,
  campaignId,
  getToken,
  onClose,
}: {
  creative: Creative;
  projectId: string;
  campaignId: string;
  getToken: ReturnType<typeof useAuth>['getToken'];
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setErr(null);
    getCreativeDownloadUrl(projectId, campaignId, creative.id, getToken)
      .then(({ download_url }) => {
        if (!cancelled) setUrl(download_url);
      })
      .catch(e => {
        if (!cancelled) setErr(e?.message ?? 'preview failed');
      });
    return () => {
      cancelled = true;
    };
  }, [creative.id, projectId, campaignId, getToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isImage = creative.mime_type.startsWith('image/');
  const isPdf = creative.mime_type === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="close preview"
        onClick={onClose}
        className="absolute inset-0 bg-fg/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-label={creative.filename}
        className="relative w-full max-w-[720px] h-full bg-surface-raised/95 backdrop-blur-md border-l border-border/60 flex flex-col motion-safe:animate-slide-in-right"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1.5">
              creative · {creative.mime_type.split('/')[1]}
            </p>
            <h2 className="text-h2 font-display font-semibold text-fg leading-snug truncate">
              {creative.filename}
            </h2>
            <p className="text-body-sm text-fg-muted mt-1">
              {(creative.size_bytes / 1024).toFixed(0)} kB · uploaded{' '}
              {new Date(creative.uploaded_at).toLocaleDateString()}
            </p>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors shrink-0"
            >
              open
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 shrink-0"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-surface-sunken/40">
          {err ? (
            <p className="px-6 py-8 text-body-sm text-rose-300">{err}</p>
          ) : !url ? (
            <p className="px-6 py-8 text-body-sm text-fg-subtle">loading…</p>
          ) : isImage ? (
            <img
              src={url}
              alt={creative.filename}
              className="block w-full h-auto"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={creative.filename}
              className="w-full h-full border-0"
            />
          ) : (
            <p className="px-6 py-8 text-body-sm text-fg-muted">
              no inline preview available — use "open" above.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
