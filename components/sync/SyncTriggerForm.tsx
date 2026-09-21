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
        setErrorMessage(data.error || 'An error occurred while triggering synchronization.');
      } else {
        setSyncResult(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to backend server.');
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
          <span>Pipeline Synchronization Execution & Configuration</span>
        </h3>

        <form onSubmit={handleRunSync} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Tenant Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Target Tenant
              </label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="all">All Tenants</option>
                <option value="TNTA">Tenant A (TNTA)</option>
                <option value="TNTB">Tenant B (TNTB)</option>
                <option value="TNTC">Tenant C (TNTC)</option>
                <option value="TNTD">Tenant D (TNTD)</option>
                <option value="TES1">Tenant TES1 (TES1)</option>
              </select>
            </div>

            {/* Pipeline Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Pipeline Channel
              </label>
              <select
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="all">All Pipelines (Full Sync)</option>
                <option value="wazuh-indexer-to-mongo">Wazuh Indexer ➔ MongoDB</option>
                <option value="mongo-to-redis">MongoDB ➔ Redis Real-time Warmup</option>
                <option value="iris-to-mongo">DFIR-IRIS ➔ MongoDB Reports</option>
                <option value="wazuh-agents">Wazuh Telemetry & Agent Discovery</option>
              </select>
            </div>

            {/* Time Range */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Data Time Range
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white hover:bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
              >
                <option value="24hours">Last 24 Hours</option>
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="all">All History (Historical All)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isRunning}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Executing Synchronization...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Run Pipeline Synchronization</span>
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
                  Pipeline Synchronization Completed Successfully
                </h4>
                <p className="text-xs text-slate-500">
                  Target Tenant: {syncResult.tenantsProcessed?.join(', ')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="text-right">
                <span className="text-slate-400">Total Duration</span>
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
              <span>Real-Time Pipeline Execution Log:</span>
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
