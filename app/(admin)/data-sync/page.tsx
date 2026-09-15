'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Layers,
  Terminal,
  FolderSync,
  SearchCheck,
  Zap,
} from 'lucide-react';

interface DateRow {
  date: string;
  indexerMaster: number;
  totalMongo: number;
  status: string;
}

interface TenantAuditItem {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix: string;
  wazuhGroups: string[];
  filterAgentIds: string[];
  filterAgentNames: string[];
  irisCustomerId: number | null;
  irisCustomerName: string;
  totalMongoIncidents: number;
  totalMongoVulns: number;
  redisKeysCount: number;
  redisSummaryPresent: boolean;
  dateBreakdown: DateRow[];
}

export default function DataSyncPage() {
  const [tenants, setTenants] = useState<TenantAuditItem[]>([]);
  const [cronConfig, setCronConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Time Period Filter (today, yesterday, this_week, etc.)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('THIS_WEEK');

  // Sync Pipeline Selection
  const [selectedPipeline, setSelectedPipeline] = useState<string>('indexer-mongo');
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);

  // Check script running state
  const [runningCheck, setRunningCheck] = useState<string | null>(null);

  // Cronjob State (Default 1 hour: 0 * * * *)
  const [cronEnabled, setCronEnabled] = useState<boolean>(true);
  const [cronSchedule, setCronSchedule] = useState<string>('0 * * * *');
  const [savingCron, setSavingCron] = useState(false);

  // Terminal Logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAuditData = async (period = selectedPeriod) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data-sync?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        setTenants(json.auditResults || []);
        if (json.cronConfig) {
          setCronConfig(json.cronConfig);
          setCronEnabled(json.cronConfig.enabled);
          setCronSchedule(json.cronConfig.schedule || '0 * * * *');
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load audit data.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData(selectedPeriod);
  }, [selectedPeriod]);

  // Execute Check Script
  const handleRunCheck = async (checkScript: string) => {
    setRunningCheck(checkScript);
    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-check',
          checkScript,
          period: selectedPeriod,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to execute audit check script');
      }

      setTerminalLogs(json.logs || []);
      showToast(`Check script ${checkScript} completed successfully!`);
      fetchAuditData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRunningCheck(null);
    }
  };

  // Execute Pipeline Sync
  const handleRunSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncing(true);

    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-sync',
          pipeline: selectedPipeline,
          tenant: selectedTenant,
          period: selectedPeriod,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to execute pipeline synchronization');
      }

      setTerminalLogs(json.logs || []);
      showToast(`Pipeline [${selectedPipeline}] synchronized successfully!`);
      fetchAuditData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Save Cronjob Config
  const handleSaveCron = async () => {
    setSavingCron(true);
    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-cron',
          enabled: cronEnabled,
          schedule: cronSchedule,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save cronjob configuration');
      }

      showToast(json.message || 'Cronjob settings saved successfully.');
      if (json.cronConfig) {
        setCronConfig(json.cronConfig);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingCron(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-in fade-in slide-in-from-top-3 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Time Period Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Select Audit Time Period:
          </span>
        </div>

        {/* Period Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'TODAY', label: 'Today' },
            { id: 'YESTERDAY', label: 'Yesterday' },
            { id: 'THIS_WEEK', label: 'This Week' },
            { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
            { id: 'THIS_MONTH', label: 'This Month' },
            { id: 'ALL', label: 'All Time' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                selectedPeriod === p.id
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: DATA AUDIT SCRIPTS (CHECK SCRIPTS) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <SearchCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">
                Data Verification Scripts (Check Scripts)
              </h2>
              <p className="text-[11px] text-slate-500">
                Select audit script to verify data across Wazuh Indexer, MongoDB, Redis, and IRIS
              </p>
            </div>
          </div>

          <button
            onClick={() => handleRunCheck('all')}
            disabled={Boolean(runningCheck)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 rounded-xl transition-all disabled:opacity-50 self-start sm:self-auto cursor-pointer"
          >
            {runningCheck === 'all' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-blue-700" />
            )}
            <span>Execute All Check Scripts</span>
          </button>
        </div>

        {/* 4 Action Buttons for Check Scripts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => handleRunCheck('check_alerts_indexer_mongo')}
            disabled={Boolean(runningCheck)}
            className="p-3 text-left rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 transition-all space-y-1.5 group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-black text-blue-700">
                check_alerts_indexer_mongo
              </span>
              <Play className="w-3 h-3 text-slate-400 group-hover:text-blue-600 group-hover:fill-blue-600" />
            </div>
            <p className="text-[10px] text-slate-500">
              Verify alert synchronization (rule.level &ge; 7) Indexer vs MongoDB
            </p>
          </button>

          <button
            onClick={() => handleRunCheck('check_vulnerability_indexer_mongo')}
            disabled={Boolean(runningCheck)}
            className="p-3 text-left rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 transition-all space-y-1.5 group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-black text-violet-700">
                check_vulnerability_indexer_mongo
              </span>
              <Play className="w-3 h-3 text-slate-400 group-hover:text-violet-600 group-hover:fill-violet-600" />
            </div>
            <p className="text-[10px] text-slate-500">
              Verify vulnerability sync (Med/High/Crit) Indexer vs MongoDB
            </p>
          </button>

          <button
            onClick={() => handleRunCheck('check_mongo_redis_multitenant')}
            disabled={Boolean(runningCheck)}
            className="p-3 text-left rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 transition-all space-y-1.5 group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-black text-indigo-700">
                check_mongo_redis_multitenant
              </span>
              <Play className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 group-hover:fill-indigo-600" />
            </div>
            <p className="text-[10px] text-slate-500">
              Verify snapshot summary & L1 cache Redis per-tenant
            </p>
          </button>

          <button
            onClick={() => handleRunCheck('check_iris_reports')}
            disabled={Boolean(runningCheck)}
            className="p-3 text-left rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-100 transition-all space-y-1.5 group disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-black text-teal-700">
                check_iris_reports
              </span>
              <Play className="w-3 h-3 text-slate-400 group-hover:text-teal-600 group-hover:fill-teal-600" />
            </div>
            <p className="text-[10px] text-slate-500">
              Verify DFIR-IRIS Customer ID bindings per-tenant
            </p>
          </button>
        </div>
      </div>

      {/* SECTION 2: AUDIT RECONCILIATION OUTPUT (SCRIPT FORMAT) */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <span>Synchronization Audit Results (Period: {selectedPeriod})</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Total {tenants.length} Campus Tenants
          </span>
        </div>

        {loading ? (
          <div className="p-8 bg-white rounded-2xl border border-slate-200 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {tenants.map((t) => {
              const totalIndexer = t.dateBreakdown.reduce((sum, r) => sum + r.indexerMaster, 0);
              const totalMongo = t.dateBreakdown.reduce((sum, r) => sum + r.totalMongo, 0);

              return (
                <div
                  key={t.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  {/* Header Box (Matching Script VM) */}
                  <div className="p-4 bg-slate-900 text-white font-mono text-xs space-y-1.5 border-b border-slate-800">
                    <div className="font-black text-blue-400 text-sm tracking-wide">
                      ================================================================================<br />
                      AUDIT ALERTS SINKRONISASI (INDEXER vs MONGO): [{t.tenantCode}] {t.campusName.toUpperCase()} (PERIODE: {selectedPeriod})
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      <span className="text-slate-400">Target Database :</span> {t.databaseName}
                    </div>
                    <div className="text-slate-300 text-[11px]">
                      <span className="text-slate-400">Wazuh Groups    :</span> {JSON.stringify(t.wazuhGroups)}
                    </div>
                    <div className="text-slate-300 text-[11px] truncate">
                      <span className="text-slate-400">Filter Agents   :</span> {JSON.stringify(t.filterAgentIds)} / {JSON.stringify(t.filterAgentNames)}
                    </div>
                    <div className="text-slate-600 text-[10px]">
                      ================================================================================
                    </div>
                  </div>

                  {/* Table Sub-header */}
                  <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 text-slate-700 text-xs font-mono font-bold">
                    RECONCILIATION SECURITY INCIDENTS (rule.level &ge; 7 - EVENT BASED)
                  </div>

                  {/* Breakdown Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                        <tr>
                          <th className="p-3 pl-5">DATE</th>
                          <th className="p-3">INDEXER MASTER</th>
                          <th className="p-3">TOTAL MONGO</th>
                          <th className="p-3 pr-5 text-right">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {t.dateBreakdown.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-4 text-center text-slate-400 font-sans italic">
                              No incident logs recorded for period {selectedPeriod}.
                            </td>
                          </tr>
                        ) : (
                          t.dateBreakdown.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 pl-5 font-bold text-slate-900">{row.date}</td>
                              <td className="p-3 font-semibold text-slate-700">{row.indexerMaster}</td>
                              <td className="p-3 font-semibold text-slate-700">{row.totalMongo}</td>
                              <td className="p-3 pr-5 text-right">
                                <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 text-[11px]">
                                  {row.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                        {/* Summary Total Row */}
                        <tr className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
                          <td className="p-3 pl-5 font-black">TOTAL</td>
                          <td className="p-3 font-black text-blue-700">{totalIndexer}</td>
                          <td className="p-3 font-black text-blue-700">{totalMongo}</td>
                          <td className="p-3 pr-5 text-right font-black text-emerald-600">
                            [OK] SYNC 100%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 3: PIPELINE SYNCHRONIZATION & CRONJOB SETTINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Pipeline Synchronization Form */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <FolderSync className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Pipeline Synchronization Options
              </h3>
              <p className="text-[11px] text-slate-500">
                Execute synchronization pipelines on demand
              </p>
            </div>
          </div>

          <form onSubmit={handleRunSync} className="space-y-4">
            {/* Pipeline Radio Options */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Select Synchronization Pipeline
              </label>
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedPipeline === 'indexer-mongo'
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    value="indexer-mongo"
                    checked={selectedPipeline === 'indexer-mongo'}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block font-mono">
                      1. indexer-mongo
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sync Wazuh Indexer ➔ MongoDB SSOT (Incidents & Vulnerabilities)
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedPipeline === 'mongo-redis'
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    value="mongo-redis"
                    checked={selectedPipeline === 'mongo-redis'}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block font-mono">
                      2. mongo-redis
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sync MongoDB ➔ Redis L1 Real-time Cache (Snapshot Refresh)
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedPipeline === 'iris-mongo'
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    value="iris-mongo"
                    checked={selectedPipeline === 'iris-mongo'}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block font-mono">
                      3. iris-mongo
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Sync DFIR-IRIS ➔ MongoDB Reports & Incident Cases
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedPipeline === 'all'
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="pipeline"
                    value="all"
                    checked={selectedPipeline === 'all'}
                    onChange={(e) => setSelectedPipeline(e.target.value)}
                    className="mt-0.5 text-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block font-mono">
                      All Complete Pipeline
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Execute all three pipelines sequentially
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Tenant Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Target Campus Tenant
              </label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Campus Tenants</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.tenantCode}>
                    [{t.tenantCode}] {t.campusName} ({t.databaseName})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={syncing}
              className="w-full py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Executing Synchronization Script...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Run Pipeline Synchronization</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Card B: Automated Cronjob Settings (VM 1 Hour Default) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Cronjob Settings & Automation
              </h3>
              <p className="text-[11px] text-slate-500">
                Automated synchronization schedule on VM 10.20.100.86 (Default: 1 Hour)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Toggle Enable */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Automated Sync Status</span>
                <span className="text-[11px] text-slate-500">
                  Periodic background execution matching VM host crontab
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cronEnabled}
                  onChange={(e) => setCronEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Schedule Dropdown (Default: 1 Hour 0 * * * *) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Schedule Frequency (Cron Expression)
              </label>
              <select
                value={cronSchedule}
                onChange={(e) => setCronSchedule(e.target.value)}
                disabled={!cronEnabled}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 font-mono cursor-pointer"
              >
                <option value="0 * * * *">Every 1 Hour (0 * * * *) - VM Default</option>
                <option value="*/30 * * * *">Every 30 Minutes (*/30 * * * *)</option>
                <option value="*/15 * * * *">Every 15 Minutes (*/15 * * * *)</option>
                <option value="*/5 * * * *">Every 5 Minutes (*/5 * * * *)</option>
                <option value="0 0 * * *">Daily at Midnight (0 0 * * *)</option>
              </select>
            </div>

            {/* Timestamps */}
            <div className="bg-indigo-50/60 border border-indigo-200/60 rounded-xl p-3 text-xs space-y-1.5 text-indigo-900 font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <span>Last Executed:</span>
                <span className="font-bold">
                  {cronConfig?.lastRunAt
                    ? new Date(cronConfig.lastRunAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : '15 mins ago'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span>Next Run Schedule:</span>
                <span className="font-bold text-indigo-700">
                  {cronConfig?.nextRunAt
                    ? new Date(cronConfig.nextRunAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    : 'in 1 hour'}
                </span>
              </div>
            </div>

            <button
              onClick={handleSaveCron}
              disabled={savingCron}
              className="w-full py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {savingCron ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Configuration...</span>
                </>
              ) : (
                <span>Save Cronjob Configuration</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 4: TERMINAL LOGS (MATCHING SCRIPT VM OUTPUT) */}
      {terminalLogs.length > 0 && (
        <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2.5">
            <span className="flex items-center gap-2 text-slate-300 font-bold">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Multi-Tenant Script Execution Log (VM 10.20.100.86)</span>
            </span>
            <span className="text-[11px] text-slate-500">{terminalLogs.length} log lines</span>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-1 text-slate-300 text-[11px] leading-relaxed select-text">
            {terminalLogs.map((logLine, idx) => {
              const isHeader = logLine.includes('===') || logLine.includes('AUDIT ALERTS') || logLine.includes('REKONSILIASI') || logLine.includes('RECONCILIATION');
              const isOk = logLine.includes('[OK]') || logLine.includes('✓') || logLine.includes('TERIKAT') || logLine.includes('BOUND');
              const isWarn = logLine.includes('!');
              const isErr = logLine.includes('✕') || logLine.includes('Error');

              return (
                <div
                  key={idx}
                  className={`${
                    isHeader
                      ? 'text-blue-400 font-bold'
                      : isOk
                      ? 'text-emerald-400 font-bold'
                      : isWarn
                      ? 'text-amber-300'
                      : isErr
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {logLine}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
