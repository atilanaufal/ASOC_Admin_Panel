import React from 'react';
import { clsx } from 'clsx';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  badge?: React.ReactNode;
  className?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'slate';
}

export function MetricCard({
  title,
  value,
  subtext,
  icon,
  trend,
  badge,
  className,
  color = 'blue',
}: MetricCardProps) {
  const colorStyles = {
    blue: 'border-blue-100 bg-white text-blue-600 bg-blue-500/10',
    emerald: 'border-emerald-100 bg-white text-emerald-600 bg-emerald-500/10',
    amber: 'border-amber-100 bg-white text-amber-600 bg-amber-500/10',
    purple: 'border-purple-100 bg-white text-purple-600 bg-purple-500/10',
    rose: 'border-rose-100 bg-white text-rose-600 bg-rose-500/10',
    slate: 'border-slate-200 bg-white text-slate-600 bg-slate-500/10',
  };

  const iconBgStyles = {
    blue: 'bg-blue-50 text-blue-600 border border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border border-amber-100',
    purple: 'bg-purple-50 text-purple-600 border border-purple-100',
    rose: 'bg-rose-50 text-rose-600 border border-rose-100',
    slate: 'bg-slate-100 text-slate-700 border border-slate-200',
  };

  return (
    <div
      className={clsx(
        'rounded-xl p-5 border bg-white border-slate-200/80 shadow-sm transition-all duration-200 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
              {value}
            </span>
            {badge}
          </div>
          {subtext && (
            <p className="mt-1 text-xs text-slate-500">
              {subtext}
            </p>
          )}
          {trend && (
            <p className="mt-2 text-xs flex items-center gap-1">
              <span
                className={clsx(
                  'font-semibold',
                  trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {trend.value}
              </span>
              <span className="text-slate-400">vs target</span>
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-lg flex items-center justify-center', iconBgStyles[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
