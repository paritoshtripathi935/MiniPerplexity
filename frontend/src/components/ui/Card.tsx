import React, { HTMLAttributes } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Slightly raised — adds a soft shadow for content that needs to pop. */
  raised?: boolean;
  /** Reactive hover treatment for cards that are entirely clickable. */
  interactive?: boolean;
}

export function Card({
  raised = false,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-surface border border-border rounded-lg',
        raised && 'shadow-card',
        interactive &&
          'transition-colors duration-150 ease-out-quad hover:border-border-strong',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-5 pt-5 pb-2', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('px-5 pb-5', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'px-5 py-3 border-t border-border bg-surface-sunken/50 rounded-b-lg',
        className
      )}
      {...rest}
    />
  );
}
