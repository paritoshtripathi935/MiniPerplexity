/**
 * /settings/integrations — single list grouped by category (ads,
 * lifecycle, commerce, crm, collab, ops). Every provider gets the same
 * card shape with one of two tags:
 *
 *   - **active**     — provider is connected and flowing data
 *   - **coming soon** — everything else (not built yet, or built but
 *                       not yet connected by this user)
 *
 * Meta is special-cased: when connected it renders inline with the
 * per-project ad-account linker; when available-but-not-connected it
 * shows a real "connect meta" gradient CTA; otherwise it sits in the
 * group with a config-needed hint. All other providers carry a "notify
 * me" mailto.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  Loader2,
  Plus,
  Send,
  Unlink,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '../components/AppLayout';
import { BRAND_LOGOS } from '../components/BrandLogos';
import {
  connectSlack,
  disconnectMeta,
  disconnectSlack,
  getIntegrationsStatus,
  getMetaAuthorizeUrl,
  getSlackStatus,
  linkProjectAdAccount,
  listMetaAdAccounts,
  listProjectAdAccounts,
  sendSlackTest,
  unlinkProjectAdAccount,
  type AdAccountLink,
  type IntegrationsStatus,
  type MetaAdAccount,
  type ProjectSummary,
  type SlackStatus,
} from '../services/api';
import { useProjects } from '../services/queries';

interface Props {
  darkMode: boolean;
}

type Category = 'ads' | 'lifecycle' | 'commerce' | 'crm' | 'collab' | 'ops';

interface ProviderDef {
  id: string;
  name: string;
  tagline: string;
  category: Category;
}

/** Static registry. Meta is included here so it groups under "ads" just
 *  like every other ad platform — its actual UI state is driven by the
 *  API status (connected / available / unavailable). */
const PROVIDERS: ProviderDef[] = [
  { id: 'meta',       name: 'meta',        tagline: 'facebook + instagram ads — spend, CPM, CPP, ROAS', category: 'ads' },
  { id: 'google_ads', name: 'google ads',  tagline: 'search + youtube performance metrics',             category: 'ads' },
  { id: 'klaviyo',    name: 'klaviyo',     tagline: 'email + sms spend and flow performance',           category: 'lifecycle' },
  { id: 'shopify',    name: 'shopify',     tagline: 'order volume, blended CAC, product velocity',      category: 'commerce' },
  { id: 'hubspot',    name: 'hubspot',     tagline: 'crm-anchored lifecycle + cohort audits',           category: 'crm' },
  { id: 'slack',      name: 'slack',       tagline: 'export investigations to a channel',               category: 'collab' },
  { id: 'notion',     name: 'notion',      tagline: 'sync briefs + play outputs to a database',         category: 'collab' },
  { id: 'discord',    name: 'discord',     tagline: 'push high-priority alerts to a server',            category: 'collab' },
  { id: 'linear',     name: 'linear',      tagline: 'turn next-steps into issues in one click',         category: 'ops' },
  { id: 'zapier',     name: 'zapier',      tagline: 'webhook bridge to 5,000+ tools',                   category: 'ops' },
];

/** Display order mirrors a marketer's mental model: where money goes →
 *  retention → revenue → customer data → people → automation. */
const CATEGORY_ORDER: Category[] = ['ads', 'lifecycle', 'commerce', 'crm', 'collab', 'ops'];

const CATEGORY_HEADING: Record<Category, { title: string; subtitle: string }> = {
  ads:       { title: 'ads',       subtitle: 'paid acquisition — spend, performance, audiences' },
  lifecycle: { title: 'lifecycle', subtitle: 'email + sms + push — retention performance and flows' },
  commerce:  { title: 'commerce',  subtitle: 'storefront + order data — blended CAC and product velocity' },
  crm:       { title: 'crm',       subtitle: 'customer data + cohort audits' },
  collab:    { title: 'collab',    subtitle: 'where your team already works — briefs, alerts, exports' },
  ops:       { title: 'ops',       subtitle: 'turn next-steps into work — issues, webhooks, automation' },
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
  const slackStatusFlag = useMemo(
    () => status?.providers.find(p => p.provider === 'slack') ?? null,
    [status],
  );

  // Detail fetch for Slack — pulls the masked URL + connected_at when
  // there's an active connection. Used by the manage panel; we only
  // fetch when status.connected flips to true so disconnected cards
  // don't trigger a useless round-trip.
  const [slackDetail, setSlackDetail] = useState<SlackStatus | null>(null);
  useEffect(() => {
    if (!isSignedIn || !slackStatusFlag?.connected) {
      setSlackDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await getSlackStatus(getToken);
        if (!cancelled) setSlackDetail(d);
      } catch {
        // non-fatal — manage panel falls back to "details unavailable"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, slackStatusFlag?.connected, getToken]);

  // Tag-count buckets for the summary strip. Mirrors `statusState()` so
  // the totals stay in sync with what each card renders. The numbers
  // sum to PROVIDERS.length.
  const counts = useMemo(() => {
    let active = 0;
    let live = 0;
    let comingSoon = 0;
    for (const p of PROVIDERS) {
      const state = statusState({
        isMeta: p.id === 'meta',
        metaConnected: !!metaStatus?.connected,
        metaAvailable: !!metaStatus?.available,
        isSlack: p.id === 'slack',
        slackConnected: !!slackStatusFlag?.connected,
      });
      if (state === 'active') active += 1;
      else if (state === 'live') live += 1;
      else comingSoon += 1;
    }
    return { active, live, comingSoon };
  }, [metaStatus?.connected, metaStatus?.available, slackStatusFlag?.connected]);

  async function handleSlackDisconnect() {
    if (!window.confirm('disconnect slack? you can re-paste the webhook url later to reconnect.')) return;
    setErr(null);
    try {
      await disconnectSlack(getToken);
      setSlackDetail(null);
      await refreshStatus();
      setBanner({ kind: 'success', text: 'slack disconnected.' });
    } catch (e: any) {
      setErr(e?.message ?? 'failed to disconnect');
    }
  }

  async function handleSlackConnected(detail: SlackStatus) {
    setSlackDetail(detail);
    await refreshStatus();
    setBanner({ kind: 'success', text: 'slack connected. test message sent to the channel.' });
  }

  async function handleMetaConnect() {
    setErr(null);
    try {
      const { authorize_url } = await getMetaAuthorizeUrl(getToken);
      window.location.href = authorize_url;
    } catch (e: any) {
      setErr(e?.message ?? 'failed to start meta connect');
    }
  }

  async function handleMetaDisconnect() {
    if (!window.confirm('disconnect meta? this unlinks any ad accounts mapped to your projects.')) return;
    setErr(null);
    try {
      await disconnectMeta(getToken);
      await refreshStatus();
      setBanner({ kind: 'success', text: 'meta disconnected.' });
    } catch (e: any) {
      setErr(e?.message ?? 'failed to disconnect');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="integrations."
        subtitle="connect the platforms you run paid acquisition and ops on. grouped by what they do for you."
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

      {/* Summary strip — gives the page a snapshot lede without forcing
          a separate "active" section. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-body-sm text-fg-muted">
        <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
          {counts.active} active · {counts.live} live · {counts.comingSoon} coming soon
        </span>
        <span className="text-fg-subtle">·</span>
        <span>vote with a click — we ship the next integration based on demand</span>
      </div>

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
        <div className="space-y-7">
          {CATEGORY_ORDER.map(cat => {
            const items = PROVIDERS.filter(p => p.category === cat);
            if (items.length === 0) return null;
            const heading = CATEGORY_HEADING[cat];
            return (
              <section key={cat}>
                <div className="flex items-baseline gap-3 mb-3">
                  <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80">
                    {heading.title}
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
                    {items.length}
                  </span>
                  <span className="flex-1 h-px bg-border/40" aria-hidden />
                  <p className="text-body-sm text-fg-subtle hidden md:block">
                    {heading.subtitle}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(provider => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      metaConnected={!!metaStatus?.connected}
                      metaAvailable={!!metaStatus?.available}
                      onMetaConnect={handleMetaConnect}
                      onMetaDisconnect={handleMetaDisconnect}
                      slackConnected={!!slackStatusFlag?.connected}
                      slackDetail={slackDetail}
                      onSlackConnected={handleSlackConnected}
                      onSlackDisconnect={handleSlackDisconnect}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ----------------------------- Card ------------------------------------- */

function ProviderCard({
  provider,
  metaConnected,
  metaAvailable,
  onMetaConnect,
  onMetaDisconnect,
  slackConnected,
  slackDetail,
  onSlackConnected,
  onSlackDisconnect,
}: {
  provider: ProviderDef;
  metaConnected: boolean;
  metaAvailable: boolean;
  onMetaConnect: () => void;
  onMetaDisconnect: () => void;
  slackConnected: boolean;
  slackDetail: SlackStatus | null;
  onSlackConnected: (detail: SlackStatus) => void | Promise<void>;
  onSlackDisconnect: () => void;
}) {
  const isMeta = provider.id === 'meta';
  const isSlack = provider.id === 'slack';
  const isActive =
    (isMeta && metaConnected) || (isSlack && slackConnected);
  const Logo = BRAND_LOGOS[provider.id];

  // Connected Meta + both Slack states (connect form when not connected,
  // manage panel when connected) use the expansion. Other cards never
  // expand.
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={clsx(
        'rounded-2xl border bg-surface-raised/40 backdrop-blur transition-colors',
        isActive
          ? 'border-emerald-400/30'
          : 'border-border/60 hover:border-brand/30 hover:bg-surface-raised/60',
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <span className="grid place-items-center w-10 h-10 rounded-lg bg-white/[0.04] border border-border/40 shrink-0">
            {Logo ? <Logo size={20} /> : null}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-fg text-body-base lowercase truncate">
              {provider.name}
            </h3>
            <p className="text-body-sm text-fg-muted line-clamp-2">
              {provider.tagline}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
          <StatusTag state={statusState({ isMeta, metaConnected, metaAvailable, isSlack, slackConnected })} />
          <CardAction
            provider={provider}
            isMeta={isMeta}
            metaConnected={metaConnected}
            metaAvailable={metaAvailable}
            expanded={expanded}
            onToggleExpand={() => setExpanded(v => !v)}
            onMetaConnect={onMetaConnect}
            isSlack={isSlack}
            slackConnected={slackConnected}
          />
        </div>
      </div>

      {/* Connected-Meta expansion — only renders when expanded */}
      {isMeta && metaConnected && expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-emerald-400/15">
          <ConnectedMetaBody onDisconnect={onMetaDisconnect} />
        </div>
      )}

      {/* Slack — same expansion pattern but two flavours of body */}
      {isSlack && expanded && (
        <div
          className={clsx(
            'px-4 pb-4 pt-1 border-t',
            slackConnected ? 'border-emerald-400/15' : 'border-border/40',
          )}
        >
          {slackConnected ? (
            <ConnectedSlackBody
              detail={slackDetail}
              onDisconnect={onSlackDisconnect}
            />
          ) : (
            <SlackConnectForm onConnected={onSlackConnected} />
          )}
        </div>
      )}
    </div>
  );
}

/** Status tag state machine — three values:
 *
 *   - "active"      — this user has the integration connected. Emerald
 *                     pill with a blinking dot.
 *   - "live"        — the integration is shipped + reachable but this
 *                     user hasn't connected it yet. Brand-tinted pill,
 *                     no dot.
 *   - "coming-soon" — not yet built. Neutral grey pill.
 *
 *   The previous binary (active / coming-soon) was misleading once
 *   Slack went live — disconnected users saw "coming soon" on a card
 *   they could literally click connect on. "live" closes that gap.
 */
type StatusTagState = 'active' | 'live' | 'coming-soon';

function statusState(args: {
  isMeta: boolean;
  metaConnected: boolean;
  metaAvailable: boolean;
  isSlack: boolean;
  slackConnected: boolean;
}): StatusTagState {
  if (args.isSlack) {
    return args.slackConnected ? 'active' : 'live';
  }
  if (args.isMeta) {
    if (args.metaConnected) return 'active';
    return args.metaAvailable ? 'live' : 'coming-soon';
  }
  return 'coming-soon';
}

function StatusTag({ state }: { state: StatusTagState }) {
  if (state === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 h-6 rounded-md border border-emerald-400/30 bg-emerald-400/10 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-status-blink" aria-hidden />
        active
      </span>
    );
  }
  if (state === 'live') {
    return (
      <span className="inline-flex items-center px-2 h-6 rounded-md border border-brand/30 bg-brand/5 font-mono text-[10px] uppercase tracking-wider text-brand">
        live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 h-6 rounded-md border border-border/60 bg-surface-sunken/40 font-mono text-[10px] uppercase tracking-wider text-fg-subtle">
      coming soon
    </span>
  );
}

function CardAction({
  provider,
  isMeta,
  metaConnected,
  metaAvailable,
  expanded,
  onToggleExpand,
  onMetaConnect,
  isSlack,
  slackConnected,
}: {
  provider: ProviderDef;
  isMeta: boolean;
  metaConnected: boolean;
  metaAvailable: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onMetaConnect: () => void;
  isSlack: boolean;
  slackConnected: boolean;
}) {
  // Meta: three sub-states drive three different actions.
  if (isMeta) {
    if (metaConnected) {
      return (
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-fg transition-colors"
        >
          {expanded ? 'hide' : 'manage'}
          <ChevronDown
            className={clsx('w-3 h-3 transition-transform', expanded && 'rotate-180')}
          />
        </button>
      );
    }
    if (metaAvailable) {
      return (
        <button
          type="button"
          onClick={onMetaConnect}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_14px_rgba(124,92,255,0.3)] hover:shadow-[0_0_20px_rgba(124,92,255,0.45)] transition-shadow"
        >
          <LinkIcon className="w-3 h-3" />
          connect
        </button>
      );
    }
    // dormant — env creds missing
    return (
      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-300/80">
        config needed
      </span>
    );
  }

  // Slack: two states. Connected → manage toggle. Not connected →
  // "connect" button that opens the paste-URL form below the card.
  if (isSlack) {
    return (
      <button
        type="button"
        onClick={onToggleExpand}
        className={clsx(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-body-sm font-medium transition-shadow',
          slackConnected
            ? 'text-fg-muted hover:text-fg'
            : 'bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white shadow-[0_0_14px_rgba(124,92,255,0.3)] hover:shadow-[0_0_20px_rgba(124,92,255,0.45)]',
        )}
      >
        {slackConnected ? (
          <>
            {expanded ? 'hide' : 'manage'}
            <ChevronDown
              className={clsx('w-3 h-3 transition-transform', expanded && 'rotate-180')}
            />
          </>
        ) : (
          <>
            <LinkIcon className="w-3 h-3" />
            connect
          </>
        )}
      </button>
    );
  }

  // Everyone else — mailto vote.
  const subject = encodeURIComponent(`+1 for ${provider.name} integration`);
  const body = encodeURIComponent(
    `I'd connect ${provider.name} to PaidPilot if it shipped — using it for ${provider.tagline}.`,
  );
  return (
    <a
      href={`mailto:hello@paidpilot.app?subject=${subject}&body=${body}`}
      className="inline-flex items-center gap-1 text-body-sm text-fg-muted hover:text-brand transition-colors"
    >
      <Bell className="w-3 h-3" />
      notify me
    </a>
  );
}

/* ------------------ Connected Meta — per-project linker ----------------- */

function ConnectedMetaBody({ onDisconnect }: { onDisconnect: () => void }) {
  const { getToken, isSignedIn } = useAuth();
  const { data: projects = [] } = useProjects(getToken, !!isSignedIn);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-fg-muted">
          map a meta ad account to each project. each syncs independently.
        </p>
        <button
          type="button"
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 text-fg-muted hover:text-rose-300 hover:border-rose-400/30 text-body-sm transition-colors shrink-0"
        >
          <Unlink className="w-3 h-3" />
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
          <p className="px-4 py-5 text-body-sm text-fg-subtle text-center">
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
          {rowErr && <p className="text-body-sm text-rose-300">{rowErr}</p>}
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

/* -------- Slack — connect form (not yet connected) ---------------------- */

function SlackConnectForm({
  onConnected,
}: {
  onConnected: (detail: SlackStatus) => void | Promise<void>;
}) {
  const { getToken } = useAuth();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const detail = await connectSlack(url.trim(), getToken);
      await onConnected(detail);
      setUrl('');
    } catch (e: any) {
      setErr(e?.message ?? 'failed to connect slack');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleConnect} className="space-y-3 pt-3">
      <p className="text-body-sm text-fg-muted leading-relaxed">
        paste an <strong className="text-fg">incoming webhook URL</strong> from
        your slack workspace. we'll send a test message to confirm the channel
        is wired before saving.
      </p>
      <div className="text-body-sm text-fg-subtle">
        in slack:{' '}
        <a
          href="https://api.slack.com/messaging/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline"
        >
          create an incoming webhook →
        </a>
      </div>
      <input
        type="url"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://hooks.slack.com/services/T.../B.../..."
        autoFocus
        required
        className="w-full h-9 px-3 rounded-md border border-border/60 bg-surface-sunken/40 text-body-sm text-fg placeholder:text-fg-subtle focus:border-brand/60 focus:outline-none transition-colors"
      />
      {err && (
        <p className="text-body-sm text-rose-300 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {err}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-gradient-to-br from-[#7C5CFF] to-[#3B82F6] text-white text-body-sm font-medium shadow-[0_0_14px_rgba(124,92,255,0.3)] hover:shadow-[0_0_20px_rgba(124,92,255,0.45)] transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
          {busy ? 'testing…' : 'test & save'}
        </button>
      </div>
    </form>
  );
}

/* -------- Slack — connected body (manage / test / disconnect) ----------- */

function ConnectedSlackBody({
  detail,
  onDisconnect,
}: {
  detail: SlackStatus | null;
  onDisconnect: () => void;
}) {
  const { getToken } = useAuth();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { kind: 'success' | 'error'; text: string } | null
  >(null);

  async function handleTest() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      await sendSlackTest(getToken);
      setTestResult({ kind: 'success', text: 'test message sent.' });
    } catch (e: any) {
      setTestResult({ kind: 'error', text: e?.message ?? 'test failed' });
    } finally {
      setTesting(false);
      window.setTimeout(() => setTestResult(null), 3000);
    }
  }

  return (
    <div className="space-y-3 pt-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1">
          webhook url
        </p>
        <p className="font-mono text-body-sm text-fg break-all">
          {detail?.masked_url ?? '••• loading •••'}
        </p>
      </div>
      <p className="text-body-sm text-fg-muted leading-relaxed">
        use the <strong className="text-fg">share to slack</strong> button on
        any finished investigation turn to post the answer + citations to your
        channel.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          {testing ? 'sending…' : 'send test'}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/60 text-fg-muted hover:text-rose-300 hover:border-rose-400/30 text-body-sm transition-colors"
        >
          <Unlink className="w-3 h-3" />
          disconnect
        </button>
        {testResult && (
          <span
            className={clsx(
              'text-body-sm',
              testResult.kind === 'success' ? 'text-emerald-300' : 'text-rose-300',
            )}
          >
            {testResult.text}
          </span>
        )}
      </div>
    </div>
  );
}
