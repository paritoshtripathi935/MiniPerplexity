/**
 * /settings — account settings.
 *
 * This page is intentionally separate from project brand-profiles. Until
 * Category H landed, /settings was a brand-profile editor for the user's
 * (then-only) brand; multi-brand support meant the brand fields had to
 * move per-project. This page now owns just the user-level concerns:
 * display info, chat-model preference, theme.
 *
 * Brand context (company, ICP, voice, targets, channels) is owned per
 * project at /settings/projects/:id under the brand-profile tab.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Check, FolderKanban, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import {
  listChatModels,
  setPreferredChatModel,
  type ChatModelOption,
  type BrandProfile,
} from '../services/api';
import { useMe } from '../services/queries';
import { PageHeader } from '../components/AppLayout';
import { Button } from '../components/ui/Button';

interface Props {
  darkMode: boolean;
  /** Retained for backwards compatibility with App.tsx wiring. The
   *  per-project brand profile is the canonical source of truth now,
   *  so callers only get a notification ping when something at the
   *  account level changes; the legacy onUpdate(BrandProfile) callback
   *  is preserved as a no-op signature. */
  onUpdate?: (p: BrandProfile) => void;
}

const labelCls = 'block text-body-md font-medium mb-1.5 text-fg';
const fieldCls =
  'w-full px-3 py-2 rounded-control border border-border bg-surface text-body-sm text-fg placeholder:text-fg-subtle outline-none focus-visible:shadow-focus disabled:opacity-60';

export function SettingsPage({ darkMode }: Props) {
  const { getToken, isSignedIn } = useAuth();
  const { user } = useUser();
  const { data: me } = useMe(getToken, !!isSignedIn);

  return (
    <>
      <PageHeader
        eyebrow="settings"
        title="account."
        subtitle="your identity, the model that powers chat, and how the app looks. brand context lives per project."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <YouCard
            displayName={me?.display_name ?? user?.fullName ?? null}
            email={me?.email ?? user?.primaryEmailAddress?.emailAddress ?? null}
            imageUrl={me?.image_url ?? user?.imageUrl ?? null}
          />
          <ChatModelCard
            current={me?.preferred_chat_model ?? null}
            getToken={getToken}
          />
          <AppearanceCard darkMode={darkMode} />
        </div>

        <div className="space-y-4">
          <BrandContextEntry />
          <AboutCard />
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* You                                                                   */
/* -------------------------------------------------------------------- */

function YouCard({
  displayName,
  email,
  imageUrl,
}: {
  displayName: string | null;
  email: string | null;
  imageUrl: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
            you
          </p>
          <h2 className="font-display font-semibold text-h2 text-fg">
            identity.
          </h2>
        </div>
        <p className="text-body-sm text-fg-subtle hidden sm:block">
          managed via your account avatar.
        </p>
      </header>

      <div className="flex items-center gap-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-12 h-12 rounded-full border border-border/60 object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-surface-sunken/60 border border-border/60 grid place-items-center text-fg-muted">
            {(displayName || email || 'U').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-fg font-medium truncate">
            {displayName || 'unnamed user'}
          </div>
          <div className="text-fg-subtle text-body-sm truncate">
            {email || '—'}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Chat model                                                            */
/* -------------------------------------------------------------------- */

function ChatModelCard({
  current,
  getToken,
}: {
  current: string | null;
  getToken: ReturnType<typeof useAuth>['getToken'];
}) {
  const [models, setModels] = useState<ChatModelOption[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  useEffect(() => {
    let cancelled = false;
    listChatModels()
      .then(({ models, default: def }) => {
        if (cancelled) return;
        setModels(models);
        setDefaultId(def);
      })
      .catch(() => {
        /* swallow — the dropdown stays empty and the user keeps their default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(id: string) {
    setSelected(id);
    setSaving(true);
    setErr(null);
    try {
      await setPreferredChatModel(id, getToken);
      setSavedAt(Date.now());
    } catch (e: any) {
      setErr(e?.message || 'failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
            engine
          </p>
          <h2 className="font-display font-semibold text-h2 text-fg">
            chat model.
          </h2>
        </div>
        {savedAt && Date.now() - savedAt < 4000 && (
          <span className="text-body-md text-success inline-flex items-center gap-1">
            <Check className="w-3 h-3" /> saved
          </span>
        )}
      </header>

      <p className="text-body-sm text-fg-muted mb-4">
        which Cloudflare Workers AI model answers your investigations.
        the per-turn selector above the chat composer overrides this on
        a single turn.
      </p>

      {models.length === 0 ? (
        <p className="text-body-sm text-fg-subtle">loading…</p>
      ) : (
        <ul className="space-y-2">
          {models.map(m => {
            const isCurrent = selected === m.id;
            const isDefault = defaultId === m.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pick(m.id)}
                  disabled={saving}
                  className={clsx(
                    'w-full text-left rounded-xl border p-3 transition-colors',
                    isCurrent
                      ? 'border-brand/40 bg-brand/5'
                      : 'border-border/60 bg-surface-sunken/30 hover:bg-surface-sunken/50',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={clsx(
                        'font-display font-semibold',
                        isCurrent ? 'text-fg' : 'text-fg-muted',
                      )}
                    >
                      {m.label}
                    </span>
                    {m.recommended && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand/80">
                        recommended
                      </span>
                    )}
                    {isDefault && !m.recommended && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-subtle">
                        default
                      </span>
                    )}
                    {isCurrent && (
                      <span className="ml-auto grid place-items-center w-4 h-4 rounded-full bg-brand/15 text-brand">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-body-sm text-fg-subtle">{m.description}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {err && (
        <div className="mt-3 px-3 py-2 text-body-sm rounded-md bg-danger-subtle text-danger">
          {err}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Appearance                                                            */
/* -------------------------------------------------------------------- */

function AppearanceCard({ darkMode }: { darkMode: boolean }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-6">
      <header className="mb-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-1">
          appearance
        </p>
        <h2 className="font-display font-semibold text-h2 text-fg">theme.</h2>
      </header>
      <p className="text-body-sm text-fg-muted mb-3">
        toggle from the icon in the top-right of every page. dark is the
        operator default; the choice persists in localStorage.
      </p>
      <div className="inline-flex items-center gap-2 rounded-control border border-border/60 bg-surface-sunken/40 px-3 py-1.5 text-body-sm text-fg-muted">
        {darkMode ? (
          <>
            <Moon className="w-3.5 h-3.5" />
            currently: dark
          </>
        ) : (
          <>
            <Sun className="w-3.5 h-3.5" />
            currently: light
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- */
/* Right column                                                          */
/* -------------------------------------------------------------------- */

function BrandContextEntry() {
  return (
    <Link
      to="/settings/projects"
      className="block rounded-2xl border border-brand/30 bg-brand/5 hover:bg-brand/10 transition-colors p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand/15 text-brand shrink-0">
          <FolderKanban className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-fg font-display font-semibold mb-1">
            brand context lives per project.
          </h3>
          <p className="text-body-sm text-fg-muted leading-relaxed">
            company, ICP, voice, target CAC/ROAS, and channels are scoped
            to each brand you work on. open a project to edit its profile.
          </p>
        </div>
      </div>
    </Link>
  );
}

function AboutCard() {
  return (
    <section className="rounded-2xl border border-border/60 bg-surface-raised/40 backdrop-blur p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand/80 mb-3">
        what's here
      </p>
      <ul className="text-body-sm text-fg-muted space-y-2.5 leading-relaxed">
        <li>
          <span className="text-fg">your identity</span> + chat-model
          choice + appearance.
        </li>
        <li>
          <span className="text-fg">brand context</span> belongs to a
          project. each project has its own profile.
        </li>
        <li>
          stored on Neon, scoped to your account. never shared.
        </li>
      </ul>
    </section>
  );
}
