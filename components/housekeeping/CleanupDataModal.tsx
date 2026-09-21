'use client';

import React, { useState } from 'react';
import {
  X,
  Trash2,
  Building2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Eye,
  ShieldAlert,
} from 'lucide-react';

interface TenantOption {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
}

interface CleanupDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  tenants: TenantOption[];
}

export function CleanupDataModal({
  isOpen,
  onClose,
  onSuccess,
  tenants,
}: CleanupDataModalProps) {
  const [selectedTenant, setSelectedTenant] = useState<string>(
    tenants[0]?.tenantCode || 'TNTA'
  );
  const [collection, setCollection] = useState<'all' | 'incident' | 'vulnerability'>('all');
  const [olderThanDays, setOlderThanDays] = useState<number>(90);
  const [confirmKeyword, setConfirmKeyword] = useState<string>('');

  const [simulating, setSimulating] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    deletedDocumentsCount: number;
    estimatedStorageFreedFormatted: string;
  } | null>(null);

  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTenant = tenants.find((t) => t.tenantCode === selectedTenant);

  const handleSimulateDryRun = async () => {
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch('/api/housekeeping/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: selectedTenant,
          collection,
          olderThanDays,
          dryRun: true,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to calculate dry-run simulation');
      }

      setDryRunResult({
        deletedDocumentsCount: json.deletedDocumentsCount || 0,
        estimatedStorageFreedFormatted: json.estimatedStorageFreedFormatted || '0 B',
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const handleExecutePurge = async () => {
    setPurging(true);
    setError(null);
    try {
      const res = await fetch('/api/housekeeping/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: selectedTenant,
          collection,
          olderThanDays,
          dryRun: false,
          confirmKeyword,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to purge historical data');
      }

      onSuccess(json.message || `Historical data for ${currentTenant?.campusName} purged successfully.`);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPurging(false);
    }
  };

  const isConfirmed =
    confirmKeyword.trim().toUpperCase() === currentTenant?.campusName.trim().toUpperCase() ||
    confirmKeyword.trim().toUpperCase() === 'PURGE' ||
    confirmKeyword.trim().toUpperCase() === currentTenant?.tenantCode.trim().toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                MongoDB Historical Data Cleanup
              </h3>
              <p className="text-xs text-slate-500">
                Purge aged logs based on retention threshold with Dry-Run simulation
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
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
              <span>Target Tenant Database</span>
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => {
                setSelectedTenant(e.target.value);
                setDryRunResult(null);
              }}
              className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer transition-all"
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.tenantCode}>
                  {t.campusName} ({t.tenantCode})
                </option>
              ))}
            </select>
          </div>

          {/* Collection & Age Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Collection
              </label>
              <select
                value={collection}
                onChange={(e) => {
                  setCollection(e.target.value as any);
                  setDryRunResult(null);
                }}
                className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer transition-all"
              >
                <option value="all">All (Incidents & Vulnerabilities)</option>
                <option value="incident">Incidents Collection (incident)</option>
                <option value="vulnerability">Vulnerabilities Collection (vulnerability)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Age Retention Threshold
              </label>
              <select
                value={olderThanDays}
                onChange={(e) => {
                  setOlderThanDays(Number(e.target.value));
                  setDryRunResult(null);
                }}
                className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 cursor-pointer transition-all"
              >
                <option value={30}>Older than 30 Days</option>
                <option value={90}>Older than 90 Days (3 Months)</option>
                <option value={180}>Older than 180 Days (6 Months)</option>
                <option value={365}>Older than 1 Year (365 Days)</option>
              </select>
            </div>
          </div>

          {/* Dry-Run Simulation Button & Results */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-500" />
                  <span>Pre-Purge Dry-Run Simulation</span>
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Simulate document counts without modifying the physical database
                </span>
              </div>
              <button
                type="button"
                onClick={handleSimulateDryRun}
                disabled={simulating}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{simulating ? 'Calculating...' : 'Run Dry-Run'}</span>
              </button>
            </div>

            {dryRunResult && (
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Total Documents Identified:</span>
                  <span className="font-mono font-extrabold text-rose-600">
                    {dryRunResult.deletedDocumentsCount} Documents
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Estimated Storage Freed:</span>
                  <span className="font-mono font-extrabold text-emerald-600">
                    {dryRunResult.estimatedStorageFreedFormatted}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Permanent Purge Safety Confirmation */}
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold text-rose-900">
                  Permanent Purge Confirmation
                </h4>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  This action cannot be undone. Type <span className="font-mono font-bold select-all bg-rose-500/20 px-1 py-0.5 rounded">{currentTenant?.campusName}</span> or <span className="font-mono font-bold bg-rose-500/20 px-1 py-0.5 rounded">PURGE</span> to enable execution:
                </p>
              </div>
            </div>

            <input
              type="text"
              value={confirmKeyword}
              onChange={(e) => setConfirmKeyword(e.target.value)}
              placeholder={`Type '${currentTenant?.campusName}' or 'PURGE'`}
              className="w-full px-3.5 py-2 bg-white rounded-xl border border-rose-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleExecutePurge}
            disabled={!isConfirmed || purging}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span>{purging ? 'Purging Data...' : 'Execute Data Purge'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
