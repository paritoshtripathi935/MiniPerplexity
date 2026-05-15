/**
 * /settings/integrations — connect external platforms.
 *
 * Three-section layout:
 *
 *   1. Active integrations — providers with an active connection. Hidden
 *      entirely when nothing is connected. Renders rich detail (ad
 *      account linker per project for Meta).
 *   2. Available now — providers the deploy is configured for but the
 *      user hasn't connected yet (Meta when env creds exist).
 *   3. Coming soon — Google Ads + Slack + Discord + Notion + HubSpot +
 *      Linear + Zapier + Klaviyo + Shopify, dim cards with a "notify me"
 *      mailto. These are the integrations the landing page implies and
 *      the ones operators consistently ask for.
 *
 * The OAuth handshake is still a full-page navigation; the post-OAuth
 * `?meta_connected=` / `?meta_error=` query params become a transient
 * banner above the sections.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle,
  Bell,
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
  BRAND_LOGOS,
  MetaLogo,
} from '../components/BrandLogos';
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

interface ComingSoonItem {
  id: string;
  name: string;
  tagline: string;
  category: 'ads' | 'collab' | 'crm' | 'ops' | 'commerce' | 'lifecycle';
}

const COMING_SOON: ComingSoonItem[] = [
  { id: 'google_ads', name: 'google ads', tagline: 'search + youtube performance metrics', category: 'ads' },
  { id: 'slack', name: 'slack', tagline: 'export investigations to a channel', category: 'collab' },
  { id: 'notion', name: 'notion', tagline: 'sync briefs + play outputs to a database', category: 'collab' },
  { id: 'discord', name: 'discord', tagline: 'push high-priority alerts to a server', category: 'collab' },
  { id: 'hubspot', name: 'hubspot', tagline: 'crm-anchored lifecycle + cohort audits', category: 'crm' },
  { id: 'linear', name: 'linear', tagline: 'turn next-steps into issues in one click', category: 'ops' },
  { id: 'zapier', name: 'zapier', tagline: 'webhook bridge to 5,000+ tools', category: 'ops' },
  { id: 'klaviyo', name: 'klaviyo', tagline: 'email + sms spend and flow performance', category: 'lifecycle' },
  { id: 'shopify', name: 'shopify', tagline: 'order volume, blended cac, product velocity', category: 'commerce' },
];

const CATEGORY_LABEL: Record<ComingSoonItem['category'], string> = {
  ads: 'ads',
  collab: 'collab',
  crm: 'crm',
  ops: 'ops',
  commerce: 'commerce',
  lifecycle: 'lifecycle',
};

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

  useEffect(() => {
    const connected = searchParams.get('meta_connected');
    const error = searchParams.get('meta_error');
    if (connected) {
      setBanner({ kind: 'success', text: 'meta connected.' });
      const next = new URLSearchParams(searchParams);
      next.delete('meta_connected');
      setSearchParams(next, { replace: true });
    } else if (error) {
      setBanner({
        kind: 'error',
        text: `meta connect failed: ${error.replace(/_/g, ' ')}`,
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

  const hasActive = !!metaStatus?.connected;
  const hasAvailable = !!metaStatus?.available && !metaStatus?.connected;

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="integrations."
        subtitle="connect the platforms you run paid acquisition and ops on. Meta data grounds investigations; the rest are on the queue."
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
        <div className="space-y-8">
          {hasActive && (
            <Section
              eyebrow="active"
              title="connected"
              subtitle="data flowing now. disconnect any time — historical investigations are kept."
              count={1}
            >
              <MetaProviderCard
                state="connected"
                onConnect={() => {}}
                onDisconnect={async () => {
                  if (!window.confirm('disconnect meta? this unlinks any ad accounts mapped to your projects.')) return;
                  setErr(null);
                  try {
                    await disconnectMeta(getToken);
                    await refreshStatus();
                    setBanner({ kind: 'success', text: 'meta disconnected.' });
                  } catch (e: any) {
                    setErr(e?.message ?? 'failed to disconnect');
                  }
                }}
              />
            </Section>
          )}

          {hasAvailable && (
            <Section
              eyebrow="available now"
              title="ready to connect"
              subtitle="configured on this deploy. one-click oauth, read-only access."
              count={1}
            >
              <MetaProviderCard
                state="available"
                onConnect={async () => {
                  setErr(null);
                  try {
                    const { authorize_url } = await getMetaAuthorizeUrl(getToken);
                    window.location.href = authorize_url;
                  } catch (e: any) {
                    setErr(e?.message ?? 'failed to start meta connect');
                  }
                }}
                onDisconnect={() => {}}
              />
            </Section>
          )}

          {/* Meta dormant — surface it inside Coming-soon-with-context */}
          {!metaStatus?.available && (
            <Section
              eyebrow="awaiting deploy config"
              title="dormant on this deploy"
              subtitle="code is shipped; waiting on env credentials. ping the team to enable."
              count={1}
            >
              <UnavailableMetaNotice />
            </Section>
          )}

          <Section
            eyebrow="coming soon"
            title="on the roadmap"
            subtitle="vote with a click — we ship the next integration based on demand."
            count={COMING_SOON.length}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {COMING_SOON.map(item => (
                <ComingSoonCard key={item.id} item={item} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Sections --------------------------------- */

function Section({
  eyebrow,
  title,
  subtitle,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
            {eyebrow}
          </p>
          <h2 className="font-display font-semibold text-fg text-h2 lowercase">
            {title}
          </h2>
          {subtitle && (
            <p className="text-body-sm text-fg-muted mt-1 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {typeof count === 'number' && (
          <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle whitespace-nowrap pb-1">
            {count} item{count === 1 ? '' : 's'}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------- Meta card -------------------------------- */

function MetaProviderCard({
  state,
  onConnect,
  onDisconnect,
}: {
  state: 'connected' | 'available';
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur overflow-hidden">
      <div className="absolute" />
      <header className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-white/[0.04] border border-border/40">
          <MetaLogo size={24} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-fg text-h2 lowercase">
            meta
          </h3>
          <p className="text-body-sm text-fg-muted">
            facebook + instagram ads · spend, CPM, CPP, ROAS
          </p>
        </div>
        {state === 'connected' ? (
          <span className="inline-flex items-center gap-1 px-2 h-6 rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-status-blink" aria-hidden />
            connected
          </span>
        ) : (
          <span className="inline-flex items-center px-2 h-6 rounded-md border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            not connected
          </span>
        )}
      </header>

      <div className="px-5 py-4">
        {state === 'available' ? (
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

function UnavailableMetaNotice() {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur overflow-hidden opacity-90">
      <header className="flex items-center gap-3 px-5 py-4">
        <span className="grid place-items-center w-11 h-11 rounded-xl bg-white/[0.04] border border-border/40">
          <MetaLogo size={24} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-fg-muted text-h2 lowercase">
            meta
          </h3>
          <p className="text-body-sm text-fg-subtle">
            facebook + instagram ads · awaiting credentials
          </p>
        </div>
        <span className="inline-flex items-center px-2 h-6 rounded-md border border-amber-400/30 bg-amber-400/10 font-mono text-[10px] uppercase tracking-wider text-amber-300">
          deploy config
        </span>
      </header>
      <div className="px-5 pb-4 -mt-1">
        <p className="text-body-sm text-fg-subtle">
          backend ships dormant until <code className="font-mono text-fg-muted">META_APP_ID</code>,{' '}
          <code className="font-mono text-fg-muted">META_APP_SECRET</code>,{' '}
          <code className="font-mono text-fg-muted">META_OAUTH_REDIRECT_URI</code>, and{' '}
          <code className="font-mono text-fg-muted">META_TOKEN_SECRET</code> are present in env.
        </p>
      </div>
    </section>
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
        {links && links.length > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
            {links.length} linked
          </span>
        )}
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

/* --------------------------- Coming soon card --------------------------- */

function ComingSoonCard({ item }: { item: ComingSoonItem }) {
  const Logo = BRAND_LOGOS[item.id];
  const subject = encodeURIComponent(`+1 for ${item.name} integration`);
  const body = encodeURIComponent(
    `I'd connect ${item.name} to PaidPilot if it shipped — using it for ${item.tagline}.`,
  );
  return (
    <a
      href={`mailto:hello@paidpilot.app?subject=${subject}&body=${body}`}
      className="group block rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-4 hover:border-brand/30 hover:bg-surface-raised/60 transition-colors"
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="grid place-items-center w-10 h-10 rounded-lg bg-white/[0.04] border border-border/40 shrink-0">
          {Logo ? <Logo size={20} /> : null}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-display font-semibold text-fg text-body-base lowercase truncate">
              {item.name}
            </h3>
            <span className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle border border-border/60 rounded px-1 py-px shrink-0">
              {CATEGORY_LABEL[item.category]}
            </span>
          </div>
          <p className="text-body-sm text-fg-muted line-clamp-2">
            {item.tagline}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
          coming soon
        </span>
        <span className="inline-flex items-center gap-1 text-body-sm text-fg-muted group-hover:text-brand transition-colors">
          <Bell className="w-3 h-3" />
          notify me
        </span>
      </div>
    </a>
  );
}
