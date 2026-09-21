'use client';

import React, { useState } from 'react';
import {
  X,
  Radio,
  Building2,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface TenantOption {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
}

interface FlushCacheModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  tenants: TenantOption[];
}

export function FlushCacheModal({
  isOpen,
  onClose,
  onSuccess,
  tenants,
}: FlushCacheModalProps) {
  const [selectedTenant, setSelectedTenant] = useState<string>(
    tenants[0]?.tenantCode || 'TNTA'
  );
  const [scope, setScope] = useState<'all' | 'incidents' | 'vulnerabilities' | 'devices' | 'reports'>('all');
  const [autoRepump, setAutoRepump] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTenant = tenants.find((t) => t.tenantCode === selectedTenant);
  const prefix = currentTenant?.databaseName || 'tenant_db';

  const getScopePattern = () => {
    switch (scope) {
      case 'incidents':
        return `${prefix}:incident:*`;
      case 'vulnerabilities':
        return `${prefix}:vulnerability:*`;
      case 'devices':
        return `${prefix}:device:*`;
      case 'reports':
        return `${prefix}:reports:*`;
      case 'all':
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
        throw new Error(json.error || 'Failed to flush Redis cache');
      }

      onSuccess(json.message || `Redis cache for ${currentTenant?.campusName} flushed successfully.`);
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
                Flush in-memory cache keys isolated by tenant prefix
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

          {/* Tenant Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-500" />
              <span>Target Tenant</span>
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer transition-all"
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
              Select Cache Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'All Tenant Keys', sub: `${prefix}:*` },
                { id: 'incidents', label: 'Incidents Only', sub: 'incident:*' },
                { id: 'vulnerabilities', label: 'Vulnerabilities Only', sub: 'vulnerability:*' },
                { id: 'devices', label: 'Devices Only', sub: 'device:*' },
                { id: 'reports', label: 'Reports Only', sub: 'reports:*' },
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
            <span className="text-[11px] text-slate-400 block font-semibold mb-1">Target Key Pattern:</span>
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
                Automatically read latest delta from MongoDB and populate Redis cache.
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
            <span>{loading ? 'Flushing Cache...' : 'Flush Cache Now'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
