import React from 'react';
import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'loading' | 'active' | 'disconnected';
  text?: string;
  latency?: number;
  showDot?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  status,
  text,
  latency,
  showDot = true,
  size = 'md',
}: StatusBadgeProps) {
  const isOnline = status === 'online' || status === 'active';
  const isOffline = status === 'offline' || status === 'disconnected';
  const isWarning = status === 'warning';
  const isLoading = status === 'loading';

  const defaultText = isOnline
    ? 'Online'
    : isOffline
    ? 'Offline'
    : isWarning
    ? 'Degraded'
    : 'Checking...';

  const displayText = text || defaultText;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-full transition-all duration-150',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
        isOnline && 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
        isOffline && 'bg-rose-500/10 text-rose-600 border border-rose-500/20',
        isWarning && 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
        isLoading && 'bg-slate-500/10 text-slate-600 border border-slate-500/20'
      )}
    >
      {showDot && (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full',
            isOnline && 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse',
            isOffline && 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]',
            isWarning && 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]',
            isLoading && 'bg-slate-400 animate-spin'
          )}
        />
      )}
      <span>{displayText}</span>
      {typeof latency === 'number' && latency >= 0 && (
        <span className="font-mono opacity-75 text-[11px] ml-0.5">({latency}ms)</span>
      )}
    </span>
  );
}
