'use client';

import React from 'react';
import { Database, HardDrive, Layers, Radio, Server, Sparkles } from 'lucide-react';
import { formatBytes } from '@/lib/tenant-utils';

interface TenantStorageItem {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  storage?: {
    dataSizeBytes: number;
    storageSizeBytes: number;
    indexSizeBytes: number;
    collectionsCount: number;
    documentsCount: number;
    formatted: {
      dataSize: string;
      storageSize: string;
    };
  };
  redisKeyCount?: number;
}

interface StorageBreakdownCardProps {
  tenants: TenantStorageItem[];
  loading: boolean;
  onOpenFlushModal: (tenantCode: string) => void;
  onOpenCleanupModal: (tenantCode: string) => void;
}

export function StorageBreakdownCard({
  tenants,
  loading,
  onOpenFlushModal,
  onOpenCleanupModal,
}: StorageBreakdownCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const totalStorageBytes = tenants.reduce((acc, t) => acc + (t.storage?.storageSizeBytes || 0), 0);
  const totalDataBytes = tenants.reduce((acc, t) => acc + (t.storage?.dataSizeBytes || 0), 0);
  const totalKeys = tenants.reduce((acc, t) => acc + (t.redisKeyCount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Overview Metric Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Total Alokasi Disk Mongo</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {formatBytes(totalStorageBytes)}
            </div>
            <span className="text-[11px] text-blue-500 font-semibold block mt-0.5">Database-per-Tenant</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <HardDrive className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Total Ukuran Dokumen Bersih</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {formatBytes(totalDataBytes)}
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold block mt-0.5">Raw Log & Telemetry</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <Database className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500">Total Kunci Cache Redis L1</span>
            <div className="text-2xl font-extrabold text-indigo-600 mt-1">
              {totalKeys} Keys
            </div>
            <span className="text-[11px] text-indigo-500 font-semibold block mt-0.5">Realtime In-Memory</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
            <Radio className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Per-Tenant Storage Breakdown Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <span>Storage & Cache Capacity Breakdown by Campus</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola retensi data dan selective flush secara granular per database instansi
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {tenants.map((t) => {
            const storageBytes = t.storage?.storageSizeBytes || 0;
            const percentage = totalStorageBytes > 0 ? (storageBytes / totalStorageBytes) * 100 : 0;

            return (
              <div
                key={t.id}
                className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Campus info */}
                <div className="space-y-1 md:w-1/3">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900">
                      {t.campusName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 text-[10px] font-mono font-extrabold border border-blue-500/20">
                      {t.tenantCode}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
                    <span>DB: {t.databaseName}</span>
                    <span>•</span>
                    <span>{t.storage?.collectionsCount || 0} Koleksi</span>
                  </div>
                </div>

                {/* Middle: Usage Bar */}
                <div className="flex-1 max-w-xs space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">Storage: {t.storage?.formatted?.storageSize || '0 B'}</span>
                    <span className="font-bold text-slate-800">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.max(percentage, 3)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Redis Cache: <span className="text-indigo-500 font-bold">{t.redisKeyCount || 0} keys</span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenFlushModal(t.tenantCode)}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl border border-indigo-200/50 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Flush Cache</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenCleanupModal(t.tenantCode)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl border border-rose-200/50 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Purge Data</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
