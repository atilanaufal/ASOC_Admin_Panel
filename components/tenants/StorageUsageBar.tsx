'use client';

import React from 'react';
import { Database, HardDrive } from 'lucide-react';
import type { TenantStorageMetrics } from '@/lib/tenants';

interface StorageUsageBarProps {
  storage: TenantStorageMetrics;
  maxStorageBytes?: number;
}

export function StorageUsageBar({
  storage,
  maxStorageBytes = 10 * 1024 * 1024, // Default threshold gauge 10 MB for campus DB
}: StorageUsageBarProps) {
  const currentBytes = storage.storageSizeBytes || 0;
  const percentage = Math.min(100, Math.max(3, Math.round((currentBytes / maxStorageBytes) * 100)));

  return (
    <div className="space-y-1.5 min-w-[160px]">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="font-bold text-slate-800 flex items-center gap-1">
          <HardDrive className="w-3 h-3 text-blue-500" />
          <span>{storage.storageSizeFormatted || '0 B'}</span>
        </span>
        <span className="text-[10px] text-slate-400">
          {storage.objectsCount} docs
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5">
        <div
          style={{ width: `${percentage}%` }}
          className={`h-full rounded-full transition-all duration-500 ${
            percentage > 80
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : percentage > 50
              ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
              : 'bg-gradient-to-r from-emerald-500 to-teal-500'
          }`}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400">
        <span>Idx: {storage.indexSizeFormatted || '0 B'}</span>
        <span className="text-slate-500">{storage.collectionsCount || 0} cols</span>
      </div>
    </div>
  );
}
