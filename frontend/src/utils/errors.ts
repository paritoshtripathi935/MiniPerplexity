/**
 * Error classification helpers — turn raw API / stream errors into
 * structured outcomes the UI can render in a tailored way.
 *
 * The biggest case worth special-casing: Cloudflare Workers AI's
 * daily-free-allocation quota error. It surfaces from chat streaming,
 * the improve-prompt endpoint, the next-step generator, the search
 * reranker, and (when all image accounts are tapped) the Studio
 * generator. Showing the raw error blob to a marketer is unhelpful —
 * they want to know "when can I try again" and "what should I do
 * now." This module gives every callsite a single canonical
 * description for that case.
 */

export type ErrorKind = 'quota-exhausted' | 'generic';

export interface DescribedError {
  kind: ErrorKind;
  /** Headline / single-line summary safe to show in a small banner. */
  headline: string;
  /** Optional second line — when present, callers should render it
   *  beneath the headline in a smaller / muted treatment. */
  detail?: string;
  /** The original error text, kept so an "advanced details" disclosure
   *  can still show the raw payload when the user wants to debug. */
  raw: string;
}

/** Patterns we use to recognise the Cloudflare daily-quota response.
 *  Matches the JSON body Workers AI returns on 429 — see the streaming
 *  error reported in production:
 *
 *    {"errors":[{"message":"AiError: AiError: you have used up your
 *    daily free allocation of 10,000 neurons …","code":4006}]}
 *
 *  Backend ImageGenQuotaExhaustedError uses the literal phrase
 *  "daily free allocation" in its message, so the same matcher
 *  catches both paths. */
const QUOTA_PATTERNS: RegExp[] = [
  /daily free allocation/i,
  /neurons/i,
  /\b4006\b/,
  /workers paid plan/i,
  /quota.*exhaust/i,
];

function looksLikeQuotaError(raw: string): boolean {
  // 429 alone isn't enough — could be application rate-limit. Require
  // ALSO matching one of the quota phrases to avoid mislabelling.
  const has429 = /\b429\b/.test(raw);
  const phraseHit = QUOTA_PATTERNS.some(p => p.test(raw));
  return has429 || phraseHit;
}

function nextResetUtc(now: Date = new Date()): { isoTime: string; hoursLeft: number } {
  // Cloudflare's daily free allocation resets at 00:00 UTC.
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  const diffMs = next.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
  return {
    isoTime: '00:00 UTC',
    hoursLeft,
  };
}

/** Map any thrown error / string into a structured description for
 *  the UI. Pass anything: `Error` instances, strings, even unknown
 *  values from a `catch` block. */
export function describeError(err: unknown): DescribedError {
  const raw =
    err instanceof Error ? err.message :
    typeof err === 'string' ? err :
    JSON.stringify(err);

  if (looksLikeQuotaError(raw)) {
    const { isoTime, hoursLeft } = nextResetUtc();
    return {
      kind: 'quota-exhausted',
      headline: "you've used today's ai quota.",
      detail:
        hoursLeft > 0
          ? `resets at ${isoTime} (in ~${hoursLeft}h). try again then, or contact the team to add capacity.`
          : `resets at ${isoTime} — try again in a few minutes.`,
      raw,
    };
  }

  return {
    kind: 'generic',
    headline: raw,
    raw,
  };
}
