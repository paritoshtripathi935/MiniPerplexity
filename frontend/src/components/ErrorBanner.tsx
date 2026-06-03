/**
 * Reusable inline error banner. Renders a Cloudflare quota-exhausted
 * error with a clear "resets at 00:00 UTC" treatment; falls back to a
 * neutral danger banner for anything else.
 *
 * Both states carry an optional dismiss button + an optional
 * "advanced details" disclosure for surfacing the raw error text
 * during debugging without polluting the default surface.
 */
import { useState } from 'react';
import { AlertCircle, Clock, X } from 'lucide-react';
import clsx from 'clsx';
import { describeError } from '../utils/errors';

interface Props {
  /** Anything thrown / caught — Error, string, unknown. The component
   *  classifies it internally via describeError(). */
  error: unknown;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ error, onDismiss, className }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const described = describeError(error);
  const isQuota = described.kind === 'quota-exhausted';

  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3 flex items-start gap-3',
        isQuota
          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
          : 'border-rose-400/30 bg-rose-400/10 text-rose-200',
        className,
      )}
    >
      <span className="shrink-0 mt-0.5">
        {isQuota ? (
          <Clock className="w-4 h-4 text-amber-300" />
        ) : (
          <AlertCircle className="w-4 h-4 text-rose-300" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-body-sm', isQuota && 'text-fg')}>
          {described.headline}
        </p>
        {described.detail && (
          <p className="text-body-sm text-fg-muted mt-0.5 leading-relaxed">
            {described.detail}
          </p>
        )}
        {/* Always offer a way to see the raw payload for debugging,
            but keep it collapsed by default. */}
        {described.kind === 'quota-exhausted' && (
          <button
            type="button"
            onClick={() => setShowRaw(v => !v)}
            className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:text-fg transition-colors"
          >
            {showRaw ? 'hide details' : 'show raw error'}
          </button>
        )}
        {showRaw && (
          <pre className="mt-2 font-mono text-[11px] text-fg-muted/80 bg-surface-sunken/40 border border-border/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-words max-w-full">
            {described.raw}
          </pre>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="shrink-0 text-fg-subtle hover:text-fg transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
