/**
 * /settings/integrations — connect external ad platforms.
 *
 * Phase 1 of the Meta integration (STATUS A5). Renders one card per
 * provider (Meta today, Google Ads stub for shape parity). Each card
 * has three possible states:
 *
 *   1. unavailable — the deploy has no env credentials configured;
 *      "not configured on this deploy" copy, no CTA.
 *   2. available + disconnected — gradient "connect" CTA that fires
 *      the OAuth handshake.
 *   3. available + connected — "connected" badge, list of linked
 *      ad accounts per project (collapsed/expanded toggle), and a
 *      "disconnect" affordance.
 *
 * The OAuth handshake is a full-page navigation (we redirect to Meta,
 * Meta redirects back to /api/v1/integrations/meta/callback which
 * 303s to here with ?meta_connected=1 or ?meta_error=...). We surface
 * those as a transient banner above the cards.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  Plus,
  Unlink,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import {
  disconnectMeta,
  getIntegrationsStatus,
  getMetaAuthorizeUrl,
  linkProjectAdAccount,
  listMetaAdAccounts,
  listProjectAdAccounts,
  unlinkProjectAdAccount,
  type AdAccountLink,
  type IntegrationsStatus,
  type MetaAdAccount,
  type ProjectSummary,
} from '../services/api';
import { useProjects } from '../services/queries';

interface Props {
  darkMode: boolean;
}

export function IntegrationsPage(_props: Props) {
  const { getToken, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [banner, setBanner] = useState<
    { kind: 'success' | 'error'; text: string } | null
  >(null);

  // Pick up the post-OAuth redirect query params and turn them into a
  // dismissable banner. Clean them out of the URL so a manual refresh
  // doesn't re-fire the banner.
  useEffect(() => {
    const connected = searchParams.get('meta_connected');
    const error = searchParams.get('meta_error');
    if (connected) {
      setBanner({ kind: 'success', text: 'Meta connected.' });
      const next = new URLSearchParams(searchParams);
      next.delete('meta_connected');
      setSearchParams(next, { replace: true });
    } else if (error) {
      setBanner({
        kind: 'error',
        text: `Meta connect failed: ${error.replace(/_/g, ' ')}`,
      });
      const next = new URLSearchParams(searchParams);
      next.delete('meta_error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const refreshStatus = async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setErr(null);
    try {
      const s = await getIntegrationsStatus(getToken);
      setStatus(s);
    } catch (e: any) {
      setErr(e?.message ?? 'failed to load integrations status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const metaStatus = useMemo(
    () => status?.providers.find(p => p.provider === 'meta') ?? null,
    [status],
  );
  const googleStatus = useMemo(
    () => status?.providers.find(p => p.provider === 'google_ads') ?? null,
    [status],
  );

  async function handleMetaConnect() {
    setErr(null);
    try {
      const { authorize_url } = await getMetaAuthorizeUrl(getToken);
      // Full-page redirect — preserves the CSRF cookie the backend
      // just set on the response.
      window.location.href = authorize_url;
    } catch (e: any) {
      setErr(e?.message ?? 'failed to start Meta connect');
    }
  }

  async function handleMetaDisconnect() {
    if (!window.confirm('Disconnect Meta? This unlinks any ad accounts mapped to your projects.')) return;
    setErr(null);
    try {
      await disconnectMeta(getToken);
      await refreshStatus();
      setBanner({ kind: 'success', text: 'Meta disconnected.' });
    } catch (e: any) {
      setErr(e?.message ?? 'failed to disconnect');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="integrations."
        subtitle="connect the platforms you run paid acquisition on. Meta ad-account data grounds investigations and powers the home-page CAC tile."
        actions={
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
          >
            account settings
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        }
      />

      {banner && (
        <div
          className={clsx(
            'mb-4 rounded-2xl border px-4 py-3 text-body-sm flex items-start gap-2',
            banner.kind === 'success'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200',
          )}
        >
          {banner.kind === 'success' ? (
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-fg-subtle hover:text-fg text-body-sm"
          >
            dismiss
          </button>
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-body-sm text-rose-200">
          {err}
        </div>
      )}

      {loading && !status ? (
        <p className="text-body-sm text-fg-muted">loading…</p>
      ) : (
        <div className="space-y-3">
          <MetaProviderCard
            available={!!metaStatus?.available}
            connected={!!metaStatus?.connected}
            onConnect={handleMetaConnect}
            onDisconnect={handleMetaDisconnect}
          />
          <GoogleAdsStubCard available={!!googleStatus?.available} />
        </div>
      )}
    </>
  );
}

/* ----------------------------- Meta card -------------------------------- */

function MetaProviderCard({
  available,
  connected,
  onConnect,
  onDisconnect,
}: {
  available: boolean;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <span className="grid place-items-center w-10 h-10 rounded-lg bg-[#1877F2]/15 text-[#1877F2] font-semibold text-h2">
          M
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-fg text-h2 lowercase">
            meta
          </h2>
          <p className="text-body-sm text-fg-muted">
            facebook + instagram ads · spend, CPM, CPP, ROAS
          </p>
        </div>
        <MetaStatusPill available={available} connected={connected} />
      </header>

      <div className="px-5 py-4">
        {!available ? (
          <p className="text-body-sm text-fg-subtle italic">
            not configured on this deploy. set <code className="font-mono text-fg-muted">META_APP_ID</code>,{' '}
            <code className="font-mono text-fg-muted">META_APP_SECRET</code>,{' '}
            <code className="font-mono text-fg-muted">META_OAUTH_REDIRECT_URI</code>, and{' '}
            <code className="font-mono text-fg-muted">META_TOKEN_SECRET</code> in env to enable.
          </p>
        ) : !connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-sm text-fg-muted">
              read-only access to your meta ad accounts. you'll pick which accounts to link per project.
            </p>
            <button
              type="button"
              onClick={onConnect}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_18px_rgba(124,92,255,0.3)] hover:shadow-[0_0_24px_rgba(124,92,255,0.45)] transition-shadow shrink-0"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              connect meta
            </button>
          </div>
        ) : (
          <ConnectedMetaBody onDisconnect={onDisconnect} />
        )}
      </div>
    </section>
  );
}

function MetaStatusPill({
  available,
  connected,
}: {
  available: boolean;
  connected: boolean;
}) {
  if (!available) {
    return (
      <span className="inline-flex items-center px-1.5 h-5 rounded-md border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
        unavailable
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 h-5 rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
        connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 h-5 rounded-md border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
      not connected
    </span>
  );
}

/* ------------------ Connected body — per-project linker ----------------- */

function ConnectedMetaBody({ onDisconnect }: { onDisconnect: () => void }) {
  const { getToken, isSignedIn } = useAuth();
  const { data: projects = [] } = useProjects(getToken, !!isSignedIn);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-fg-muted">
          map a meta ad account to each project. each project syncs independently.
        </p>
        <button
          type="button"
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-rose-300 hover:border-rose-400/30 text-body-sm transition-colors shrink-0"
        >
          <Unlink className="w-3.5 h-3.5" />
          disconnect
        </button>
      </div>
      <div className="rounded-xl border border-border/40 bg-surface-sunken/30 divide-y divide-border/30 overflow-hidden">
        {projects
          .filter(p => !p.archived_at)
          .map(p => (
            <ProjectRow key={p.id} project={p} />
          ))}
        {projects.length === 0 && (
          <p className="px-4 py-6 text-body-sm text-fg-subtle text-center">
            no projects yet — create one to start linking ad accounts.
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  const { getToken } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<AdAccountLink[] | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      setRowErr(null);
      try {
        const [links, accs] = await Promise.all([
          listProjectAdAccounts(project.id, getToken),
          listMetaAdAccounts(getToken),
        ]);
        if (cancelled) return;
        setLinks(links);
        setAccounts(accs.accounts);
      } catch (e: any) {
        if (!cancelled) setRowErr(e?.message ?? 'failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, project.id, getToken]);

  const linkedIds = useMemo(
    () => new Set((links ?? []).map(l => l.external_account_id)),
    [links],
  );
  const available = useMemo(
    () => (accounts ?? []).filter(a => !linkedIds.has(a.external_account_id)),
    [accounts, linkedIds],
  );

  async function handleLink(externalId: string) {
    setBusy(externalId);
    setRowErr(null);
    try {
      const link = await linkProjectAdAccount(project.id, externalId, getToken);
      setLinks(prev => (prev ? [link, ...prev] : [link]));
    } catch (e: any) {
      setRowErr(e?.message ?? 'failed to link');
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlink(linkId: string) {
    setBusy(linkId);
    setRowErr(null);
    try {
      await unlinkProjectAdAccount(project.id, linkId, getToken);
      setLinks(prev => (prev ? prev.filter(l => l.id !== linkId) : prev));
    } catch (e: any) {
      setRowErr(e?.message ?? 'failed to unlink');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-raised/40 transition-colors"
      >
        <ChevronRight
          className={clsx(
            'w-3.5 h-3.5 text-fg-subtle transition-transform',
            expanded && 'rotate-90',
          )}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-body-base text-fg font-medium truncate">
            {project.name}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {rowErr && (
            <p className="text-body-sm text-rose-300">{rowErr}</p>
          )}

          {/* Linked */}
          {links === null ? (
            <p className="text-body-sm text-fg-subtle flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> loading…
            </p>
          ) : links.length === 0 ? (
            <p className="text-body-sm text-fg-subtle italic">no accounts linked yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {links.map(l => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 px-3 h-9 rounded-md border border-border/60 bg-surface-raised/40"
                >
                  <span className="flex-1 min-w-0 text-body-sm text-fg truncate">
                    {l.account_name}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    {l.account_currency}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleUnlink(l.id)}
                    disabled={busy === l.id}
                    aria-label={`unlink ${l.account_name}`}
                    className="text-fg-subtle hover:text-rose-300 disabled:opacity-40"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Available to link */}
          {accounts && available.length > 0 && (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-2">
                available accounts
              </p>
              <ul className="space-y-1.5">
                {available.map(a => (
                  <li
                    key={a.external_account_id}
                    className="flex items-center gap-3 px-3 h-9 rounded-md border border-border/40 bg-surface-sunken/30"
                  >
                    <span className="flex-1 min-w-0 text-body-sm text-fg-muted truncate">
                      {a.name}
                      {!a.is_active && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                          inactive
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                      {a.currency}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLink(a.external_account_id)}
                      disabled={busy === a.external_account_id}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-brand/30 bg-brand/5 text-brand text-body-sm font-medium hover:bg-brand/15 disabled:opacity-40"
                    >
                      <Plus className="w-3 h-3" />
                      link
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Google Ads stub ---------------------------- */

function GoogleAdsStubCard({ available }: { available: boolean }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur opacity-70">
      <header className="flex items-center gap-3 px-5 py-4">
        <span className="grid place-items-center w-10 h-10 rounded-lg bg-fg/10 text-fg-muted font-semibold text-h2">
          G
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-fg-muted text-h2 lowercase">
            google ads
          </h2>
          <p className="text-body-sm text-fg-subtle">
            search + youtube · coming soon
          </p>
        </div>
        <span className="inline-flex items-center px-1.5 h-5 rounded-md border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          {available ? 'available' : 'soon'}
        </span>
      </header>
    </section>
  );
}
