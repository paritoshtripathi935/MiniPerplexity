import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

/**
 * Single button system. Use this everywhere a `<button>` would otherwise be
 * styled inline. Variants encode role; size encodes density.
 *
 * - primary  → the one CTA on the screen (brand fill)
 * - secondary→ supporting action (border + surface)
 * - ghost    → low-weight (no border, no fill until hover)
 * - danger   → destructive
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 shadow-card',
  secondary:
    'bg-surface text-fg border border-border hover:bg-surface-sunken active:bg-surface-sunken/80',
  ghost:
    'text-fg-muted hover:text-fg hover:bg-surface-sunken',
  danger:
    'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-1.5 rounded-md',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    leadingIcon,
    trailingIcon,
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium select-none whitespace-nowrap',
        'transition-colors duration-150 ease-out-quad',
        'disabled:opacity-50 disabled:pointer-events-none',
        'focus-visible:outline-none focus-visible:shadow-focus',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="w-3.5 h-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"
          aria-hidden
        />
      ) : leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
