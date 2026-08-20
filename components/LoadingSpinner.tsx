import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
  showLabel?: boolean;
}

const sizeMap = {
  sm: { wrapper: 'w-7 h-7', ring: 'w-7 h-7', stroke: 'w-3 h-3' },
  md: { wrapper: 'w-10 h-10', ring: 'w-10 h-10', stroke: 'w-4 h-4' },
  lg: { wrapper: 'w-14 h-14', ring: 'w-14 h-14', stroke: 'w-5 h-5' },
};

/** A compact, accessible circular loader for route and module loading states. */
export function LoadingSpinner({
  size = 'md',
  label = 'Loading...',
  className = '',
  showLabel = true,
}: LoadingSpinnerProps) {
  const sizes = sizeMap[size];

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={`relative ${sizes.wrapper}`} aria-hidden="true">
        <div className={`absolute inset-0 rounded-full border border-accent/15 dark:border-accent/20 animate-pulse`} />
        <svg className={`absolute inset-0 ${sizes.ring} animate-spin text-accent`} viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="17" stroke="currentColor" strokeOpacity="0.14" strokeWidth="3" />
          <path d="M39 22a17 17 0 0 0-17-17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div className={`absolute inset-0 m-auto ${sizes.stroke} rounded-full bg-accent shadow-[0_0_14px_rgba(225,29,72,0.45)] animate-pulse`} />
      </div>
      {showLabel && (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-zinc-400 text-center">
          {label}
        </span>
      )}
    </div>
  );
}

export default LoadingSpinner;
