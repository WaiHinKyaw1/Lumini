import { ReactNode } from 'react';

/**
 * Loading skeleton shimmer — reusable placeholder for content that is still loading.
 * Dark-mode aware (works on both light and dark themes).
 */

export function Skeleton({
  className = '',
  pulse = true,
  children,
  ariaLabel,
}: {
  className?: string;
  pulse?: boolean;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const base =
    'rounded-md bg-zinc-300/40 dark:bg-zinc-700/60';
  const anim = pulse ? ' animate-pulse' : '';
  return (
    <div className={`${base}${anim} ${className}`} aria-label={ariaLabel} aria-busy={children ? undefined : true} role="status">
      {children && <div className="invisible" aria-hidden>{children}</div>}
    </div>
  );
}

/** Shimmer bar skeleton used for loading text lines. */
export function SkeletonLine({ width = 'w-3/4', className = '' }: { width?: string; className?: string }) {
  return <Skeleton className={`h-3 ${width} ${className}`} ariaLabel="စာသား တင်ပြင်းနေပါသည်" />;
}

/** Block skeleton for a card-shaped loading placeholder. */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <Skeleton className={`h-20 ${className}`} ariaLabel="အငြိမ်းအစား ပုံစံ တင်ပြင်းနေပါသည်" />;
}
