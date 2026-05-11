/** @type {import('tailwindcss').Config}
 *
 * PaidPilot design system
 * ----------------------------------------------------------------------------
 * Material 3 purple scheme. Colours come from CSS variables defined in
 * src/index.css so light/dark themes swap atomically. Inter Variable for
 * body, Inter Display for headings. Constrained radius scale (10–12px).
 *
 * Two parallel naming layers exist on purpose:
 *   - M3 tokens (`surface-container-high`, `on-surface-variant`, ...) —
 *     used by PR D onward as the canonical names.
 *   - Legacy semantic aliases (`surface-raised`, `fg-muted`, ...) —
 *     existing pages keep working; aliased to M3 roles in src/index.css.
 *
 * Type scale matches docs/product/PAI_13_PLAN.md.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        display: [
          'InterVariable',
          'Inter Display',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      fontSize: {
        // M3-keyed operational type scale.
        'metric-lg': ['2rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '500' }],
        'h1': ['1.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h2': ['1.125rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-base': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0em', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.4', letterSpacing: '0em', fontWeight: '400' }],
        'label-caps': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      colors: {
        // ---- M3 tokens ------------------------------------------------------
        // Surface scale (tonal layering).
        'surface-bright': 'rgb(var(--m3-surface-bright) / <alpha-value>)',
        'surface-dim': 'rgb(var(--m3-surface-dim) / <alpha-value>)',
        'surface-container-lowest': 'rgb(var(--m3-surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--m3-surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--m3-surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--m3-surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--m3-surface-container-highest) / <alpha-value>)',
        // On-surface text.
        'on-surface': 'rgb(var(--m3-on-surface) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--m3-on-surface-variant) / <alpha-value>)',
        // Outlines.
        outline: 'rgb(var(--m3-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--m3-outline-variant) / <alpha-value>)',
        // Primary (accent).
        primary: {
          DEFAULT: 'rgb(var(--m3-primary) / <alpha-value>)',
          container: 'rgb(var(--m3-primary-container) / <alpha-value>)',
          fixed: 'rgb(var(--m3-primary-fixed) / <alpha-value>)',
        },
        'on-primary': 'rgb(var(--m3-on-primary) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--m3-on-primary-container) / <alpha-value>)',
        'on-primary-fixed': 'rgb(var(--m3-on-primary-fixed) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--m3-inverse-primary) / <alpha-value>)',
        // Inverse surfaces (toasts, snackbars).
        'inverse-surface': 'rgb(var(--m3-inverse-surface) / <alpha-value>)',
        'inverse-on-surface': 'rgb(var(--m3-inverse-on-surface) / <alpha-value>)',
        // M3 error.
        'm3-error': {
          DEFAULT: 'rgb(var(--m3-error) / <alpha-value>)',
          container: 'rgb(var(--m3-error-container) / <alpha-value>)',
        },
        'on-m3-error': 'rgb(var(--m3-on-error) / <alpha-value>)',
        'on-m3-error-container': 'rgb(var(--m3-on-error-container) / <alpha-value>)',

        // ---- Legacy semantic aliases (kept for back-compat) -----------------
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
          subtle: 'rgb(var(--brand-subtle) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'rgb(var(--fg-muted) / <alpha-value>)',
          subtle: 'rgb(var(--fg-subtle) / <alpha-value>)',
          inverted: 'rgb(var(--fg-inverted) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          subtle: 'rgb(var(--danger-subtle) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          subtle: 'rgb(var(--success-subtle) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          subtle: 'rgb(var(--warning-subtle) / <alpha-value>)',
        },
      },
      borderRadius: {
        // M3-keyed radius scale: 10-12px primary, 6-8px small, no pills.
        // Keeping Tailwind defaults too — these add named operational sizes.
        card: '0.75rem',   // 12px — cards, modals
        panel: '0.625rem', // 10px — primary surfaces
        chip: '0.5rem',    // 8px  — inputs, tags, small buttons
        control: '0.375rem', // 6px — tightest controls
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.02)',
        popover:
          '0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 6px -1px rgb(0 0 0 / 0.04)',
        dialog:
          '0 24px 48px -12px rgb(0 0 0 / 0.25), 0 8px 16px -8px rgb(0 0 0 / 0.12)',
        focus: '0 0 0 2px rgb(var(--surface) / 1), 0 0 0 4px rgb(var(--brand) / 0.6)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quad': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
