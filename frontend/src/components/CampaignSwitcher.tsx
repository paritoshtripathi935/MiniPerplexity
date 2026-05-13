/**
 * Top-nav project switcher.
 *
 * Pill in the header showing the active project. Clicking opens a
 * popover with a search input and the full project list; selecting a
 * project routes to /projects/:id (its home), where the user picks
 * which campaign to dive into. The popover does NOT list campaigns —
 * campaign selection happens inside the project page.
 *
 * Footer: inline "+ new project" form. Mirrors the project list page's
 * create flow so a fresh project plus its default "General" campaign
 * land in one round-trip.
 *
 * Naming kept as CampaignSwitcher for compatibility with existing
 * imports across the app; the surface is now project-first.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, Plus, Search } from 'lucide-react';
import {
  projectColor,
  useActiveCampaign,
} from './ActiveCampaign';
import {
  createCampaign,
  createProject,
  type ProjectSummary,
} from '../services/api';
import { QK } from '../services/queries';
import { useSWRConfig } from 'swr';
import { Button } from './ui/Button';

export function CampaignSwitcher() {
  const { activeProject, activeCampaign, projects } = useActiveCampaign();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!activeProject || projects.length === 0) {
    return (
      <div className="hidden md:flex items-center h-8 px-3 rounded-xl border border-border/60 bg-surface-raised/40 text-fg-subtle text-body-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-fg-subtle/40 mr-2" />
        loading…
      </div>
    );
  }

  const color = projectColor(activeProject.id);
  const subline = activeCampaign?.name;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={clsx(
          'inline-flex items-center h-8 pl-2.5 pr-2 rounded-xl border text-body-sm transition-colors duration-150',
          'min-w-0 max-w-[240px]',
          open
            ? 'border-brand/40 bg-brand/5'
            : 'border-border/60 bg-surface-raised/40 hover:bg-surface-raised/60',
        )}
        title={subline ? `${activeProject.name} · ${subline}` : activeProject.name}
      >
        <span className={clsx('w-1.5 h-1.5 rounded-full mr-2 shrink-0', color.dot)} />
        <span className="text-fg font-medium truncate">{activeProject.name}</span>
        <ChevronDown
          className={clsx(
            'w-3.5 h-3.5 ml-1.5 shrink-0 text-fg-subtle transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Switch project"
          className="absolute left-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-xl border border-border/60 bg-surface-raised/90 backdrop-blur-md shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          <SwitcherBody onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Popover body                                                          */
/* -------------------------------------------------------------------- */

function SwitcherBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { projects, activeProject } = useActiveCampaign();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(q));
  }, [projects, q]);

  function pick(project: ProjectSummary) {
    navigate(`/projects/${project.id}`);
    onClose();
  }

  return (
    <div className="py-1.5">
      <div className="px-2 pt-1 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="search projects…"
            className="w-full h-9 pl-8 pr-2.5 rounded-lg bg-surface-sunken/40 border border-border/60 text-fg text-body-sm placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
          />
        </div>
      </div>

      <ul className="max-h-[320px] overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-body-sm text-fg-subtle italic">
            no matches for "{query}"
          </li>
        )}
        {filtered.map(p => {
          const color = projectColor(p.id);
          const isActive = activeProject?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => pick(p)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-brand/5 border-l-2 border-brand'
                    : 'hover:bg-surface-sunken/40 border-l-2 border-transparent',
                )}
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', color.dot)} />
                <span className="text-fg font-medium truncate flex-1">{p.name}</span>
                {isActive && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand/80">
                    current
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <SwitcherFooter onClose={onClose} />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Footer: inline create-project                                         */
/* -------------------------------------------------------------------- */

function SwitcherFooter({ onClose }: { onClose: () => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="border-t border-border/60 px-2 py-2">
      {creating ? (
        <NewProjectForm onDone={onClose} onCancel={() => setCreating(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-sunken/40 text-body-sm transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          new project
        </button>
      )}
    </div>
  );
}

function NewProjectForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const { getToken } = useAuth();
  const { mutate } = useSWRConfig();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const project = await createProject(name.trim(), getToken);
      // Auto-add a "General" campaign so the new project is immediately
      // usable as an active scope.
      await createCampaign(project.id, { name: 'General' }, getToken);
      mutate(QK.projects);
      mutate(QK.campaigns(project.id));
      onDone();
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      setErr(e?.message || 'failed to create project');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="project name"
        maxLength={120}
        className="flex-1 h-8 px-2.5 rounded-md bg-surface-sunken/40 border border-border/60 text-fg text-body-sm placeholder:text-fg-subtle focus:outline-none focus:border-brand/40"
      />
      <Button variant="gradient" disabled={!name.trim() || submitting}>
        {submitting ? '…' : 'create'}
      </Button>
      <button
        type="button"
        onClick={onCancel}
        className="h-8 px-2 text-fg-subtle hover:text-fg text-body-sm"
      >
        cancel
      </button>
      {err && <span className="text-rose-400 text-body-sm ml-2">{err}</span>}
    </form>
  );
}
