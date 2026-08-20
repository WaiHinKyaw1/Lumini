import type { ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

/**
 * Backward-compatible loading export.
 * New loading surfaces should use LoadingSpinner directly.
 */
export function Skeleton({
  className = '',
  ariaLabel = 'Loading...',
}: {
  className?: string;
  pulse?: boolean;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  return <LoadingSpinner size="md" label={ariaLabel} className={className} />;
}

export function SkeletonLine({ className = '' }: { width?: string; className?: string }) {
  return <LoadingSpinner size="sm" label="Loading..." className={className} />;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <LoadingSpinner size="md" label="Loading..." className={className} />;
}
