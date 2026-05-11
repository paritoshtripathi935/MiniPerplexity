/**
 * PaidPilot brand mark — Concept 1 (P with chat-tail).
 *
 * Single-path silhouette designed to read at any size from 16px (favicon)
 * to 96px (login hero). Renders in `currentColor` so callers can drive the
 * fill via Tailwind `text-*` classes — the mark sits inside a coloured
 * brand chip in the nav and login, but could be used standalone on
 * dark surfaces by setting `text-primary` etc.
 *
 * Source: docs/product/PAI_13_PLAN.md → Stitch brand-identity concept #1.
 */
import { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PaidPilot"
      {...props}
    >
      <path d="M72 48H148C179.48 48 205 73.52 205 105C205 136.48 179.48 162 148 162H104L72 208V48Z" />
    </svg>
  );
}
