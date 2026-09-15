'use client';

import React, { useState } from 'react';
import {
  X,
  Radio,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';

interface TenantOption {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix?: string;
}

interface FlushCacheModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: TenantOption[];
  defaultTenantCode?: string;
  onSuccess: (message: string) => void;
}

export function FlushCacheModal({
  isOpen,
  onClose,
  tenants,
  defaultTenantCode = 'UI',
  onSuccess,
}: FlushCacheModalProps) {
  const [selectedTenant, setSelectedTenant] = useState(defaultTenantCode);
  const [scope, setScope] = useState<'all' | 'incidents' | 'vulnerabilities' | 'devices' | 'reports'>('all');
  const [autoRepump, setAutoRepump] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTenant = tenants.find((t) => t.tenantCode === selectedTenant) || tenants[0];
  const prefix = currentTenant?.databaseName || 'universitas_indonesia';

  const getScopePattern = () => {
    switch (scope) {
      case 'incidents':
        return `${prefix}:incident:*, ${prefix}:incidents`;
      case 'vulnerabilities':
        return `${prefix}:vulnerability:*, ${prefix}:vulnerabilities`;
      case 'devices':
        return `${prefix}:device:*, ${prefix}:devices:*`;
      case 'reports':
        return `${prefix}:reports:*, ${prefix}:reports`;
      default:
        return `${prefix}:*`;
    }
  };

  const handleFlush = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/housekeeping/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: selectedTenant,
          scope,
          autoRepump,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal membersihkan cache Redis');
      }

      onSuccess(json.message || `Cache Redis untuk ${currentTenant?.campusName} berhasil dibersihkan.`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Selective Redis Cache Flush
              </h3>
              <p className="text-xs text-slate-500">
                Pembersihan cache in-memory terisolasi per-prefix kampus
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Campus Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Target Kampus / Tenant</span>
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.tenantCode}>
                  {t.campusName} ({t.tenantCode})
                </option>
              ))}
            </select>
          </div>

          {/* Scope Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Pilih Ruang Lingkup Entitas Cache (*Scope*)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'All Kunci Kampus', sub: `${prefix}:*` },
                { id: 'incidents', label: 'Insiden Saja', sub: 'incident:*' },
                { id: 'vulnerabilities', label: 'Kerentanan Saja', sub: 'vulnerability:*' },
                { id: 'devices', label: 'Perangkat Saja', sub: 'device:*' },
                { id: 'reports', label: 'Laporan Saja', sub: 'reports:*' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScope(item.id as any)}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    scope === item.id
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold">{item.label}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pattern Preview */}
          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs">
            <span className="text-[11px] text-slate-400 block font-semibold mb-1">Pola Kunci yang Akan Dimusnahkan:</span>
            <code className="font-mono text-indigo-600 font-bold break-all">
              {getScopePattern()}
            </code>
          </div>

          {/* Auto-Repump Checkbox */}
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRepump}
              onChange={(e) => setAutoRepump(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Auto-Repump Fresh Data from MongoDB</span>
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Otomatis membaca data delta terbaru dari MongoDB dan mengisikannya kembali ke Redis L1 Cache.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFlush}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
            <span>{loading ? 'Membersihkan Cache...' : 'Flush Cache Sekarang'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
