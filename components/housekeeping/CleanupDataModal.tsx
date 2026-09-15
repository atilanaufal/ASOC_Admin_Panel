'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  HardDrive,
  Trash2,
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
  tenants: TenantOption[];
  defaultTenantCode?: string;
  onSuccess: (message: string) => void;
}

export function CleanupDataModal({
  isOpen,
  onClose,
  tenants,
  defaultTenantCode = 'UI',
  onSuccess,
}: CleanupDataModalProps) {
  const [selectedTenant, setSelectedTenant] = useState(defaultTenantCode);
  const [collection, setCollection] = useState<'all' | 'incident' | 'vulnerability'>('all');
  const [olderThanDays, setOlderThanDays] = useState(90);
  const [confirmKeyword, setConfirmKeyword] = useState('');

  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentTenant = tenants.find((t) => t.tenantCode === selectedTenant) || tenants[0];

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
        throw new Error(json.error || 'Failed to run dry-run simulation');
      }

      setDryRunResult(json);
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

      onSuccess(json.message || `Data historis ${currentTenant?.campusName} berhasil dimusnahkan.`);
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
                Pembersihan Data Historis MongoDB
              </h3>
              <p className="text-xs text-slate-500">
                Pemusnahan log lama berdasarkan ambang batas umur data dengan simulasi Dry-Run
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
              <span>Target Database Kampus / Tenant</span>
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => {
                setSelectedTenant(e.target.value);
                setDryRunResult(null);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
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
                Target Koleksi Dokumen
              </label>
              <select
                value={collection}
                onChange={(e) => {
                  setCollection(e.target.value as any);
                  setDryRunResult(null);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                <option value="all">All (Insiden & Kerentanan)</option>
                <option value="incident">Koleksi Insiden (incident)</option>
                <option value="vulnerability">Koleksi Kerentanan (vulnerability)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Ambang Batas Umur Data
              </label>
              <select
                value={olderThanDays}
                onChange={(e) => {
                  setOlderThanDays(Number(e.target.value));
                  setDryRunResult(null);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                <option value={30}>Lebih lama dari 30 Hari</option>
                <option value={90}>Lebih lama dari 90 Hari (3 Bulan)</option>
                <option value={180}>Lebih lama dari 180 Hari (6 Bulan)</option>
                <option value={365}>Lebih lama dari 1 Tahun (365 Hari)</option>
              </select>
            </div>
          </div>

          {/* Dry-Run Simulation Button & Results */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-blue-500" />
                  <span>Simulasi Dry-Run Pra-Pemusnahan</span>
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Uji hitung dokumen tanpa melakukan modifikasi pada database fisik
                </span>
              </div>
              <button
                type="button"
                onClick={handleSimulateDryRun}
                disabled={simulating}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {simulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{simulating ? 'Menghitung...' : 'Uji Dry-Run'}</span>
              </button>
            </div>

            {dryRunResult && (
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Total Dokumen Terdeteksi:</span>
                  <span className="font-mono font-extrabold text-rose-600">
                    {dryRunResult.deletedDocumentsCount} Dokumen
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-semibold">Estimasi Ruang Disk Dibebaskan:</span>
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
                  Konfirmasi Pemusnahan Data Permanen
                </h4>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  This action cannot be undone. Ketik <span className="font-mono font-bold select-all bg-rose-500/20 px-1 py-0.5 rounded">{currentTenant?.campusName}</span> atau <span className="font-mono font-bold bg-rose-500/20 px-1 py-0.5 rounded">PURGE</span> untuk mengaktifkan tombol eksekusi:
                </p>
              </div>
            </div>

            <input
              type="text"
              value={confirmKeyword}
              onChange={(e) => setConfirmKeyword(e.target.value)}
              placeholder={`Ketik '${currentTenant?.campusName}' atau 'PURGE'`}
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
            <span>{purging ? 'Memusnahkan Data...' : 'Eksekusi Purge Data'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
