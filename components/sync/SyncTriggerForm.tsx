'use client';

import React, { useState } from 'react';
import { RefreshCw, Play, CheckCircle2, AlertCircle, Terminal, Clock, Shield } from 'lucide-react';

interface SyncTriggerProps {
  initialTenant?: string;
}

export function SyncTriggerForm({ initialTenant = 'all' }: SyncTriggerProps) {
  const [selectedTenant, setSelectedTenant] = useState<string>(initialTenant);
  const [selectedPipeline, setSelectedPipeline] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('7days');
  const [isRunning, setIsRunning] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRunSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setSyncResult(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: selectedTenant,
          pipeline: selectedPipeline,
          timeRange,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Terjadi kesalahan saat memicu sinkronisasi.');
      } else {
        setSyncResult(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal terhubung ke backend server.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-600" />
          <span>Konfigurasi & Pemicu Eksekusi Sinkronisasi Pipeline</span>
        </h3>

        <form onSubmit={handleRunSync} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Tenant Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Target Kampus (Tenant)
              </label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Tenant Kampus (All)</option>
                <option value="UI">Universitas Indonesia (UI)</option>
                <option value="UPJ">Universitas Pembangunan Jaya (UPJ)</option>
                <option value="ITB">Institut Teknologi Bandung (ITB)</option>
              </select>
            </div>

            {/* Pipeline Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Pipeline Saluran
              </label>
              <select
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="all">All Pipeline Lengkap (Full Sync)</option>
                <option value="wazuh-indexer-to-mongo">Wazuh Indexer ➔ MongoDB SSOT</option>
                <option value="mongo-to-redis">MongoDB ➔ Redis L1 Real-time Warmup</option>
                <option value="iris-to-mongo">DFIR-IRIS ➔ MongoDB Reports</option>
                <option value="wazuh-agents">Wazuh Telemetry & Agent Discovery</option>
              </select>
            </div>

            {/* Time Range */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Rentang Waktu Data
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="24hours">Last 24 Hours</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="all">Seluruh Riwayat (Historical All)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isRunning}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sedang Menjalankan Sinkronisasi...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Jalankan Sinkronisasi Pipeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error Output */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Result Output Card */}
      {syncResult && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">
                  Sinkronisasi Pipeline Berhasil Selesai
                </h4>
                <p className="text-xs text-slate-500">
                  Target Tenant: {syncResult.tenantsProcessed?.join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <span className="text-slate-400">Total Durasi</span>
                <p className="font-mono font-bold text-slate-800">
                  {syncResult.executionDurationMs} ms
                </p>
              </div>
              <div className="text-right">
                <span className="text-slate-400">Total Records</span>
                <p className="font-mono font-bold text-emerald-600">
                  {syncResult.totalProcessedRecords} docs
                </p>
              </div>
            </div>
          </div>

          {/* Execution Terminal Logs */}
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
              <Terminal className="w-4 h-4 text-blue-500" />
              <span>Log Eksekusi Real-Time Pipeline:</span>
            </div>
            <div className="bg-slate-950 text-slate-200 font-mono text-xs p-4 rounded-xl border border-slate-800 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
              {(syncResult.logs || []).map((log: string, idx: number) => (
                <div key={idx} className="leading-relaxed">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
