'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Play, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';

interface DateRow {
  date: string;
  indexerMaster: number;
  totalMongo: number;
  status: string;
}

interface RedisAuditItem {
  incidents: {
    mongo: number;
    redis: number;
    isSynced: boolean;
    dateBreakdown: { date: string; mongo: number; redis: number; status: string }[];
  };
  vulnerabilities: {
    mongo: number;
    redis: number;
    isSynced: boolean;
  };
  reports: {
    mongo: number;
    redis: number;
    isSynced: boolean;
  };
  devices: {
    mongo: number;
    redis: number;
    isSynced: boolean;
  };
  historicalStats: {
    cached: boolean;
    isSynced: boolean;
  };
  isAllSynced: boolean;
}

interface TenantAuditItem {
  id: number;
  tenantCode: string;
  tenantName: string;
  campusName?: string;
  databaseName: string;
  redisPrefix: string;
  wazuhGroups: string[];
  filterAgentIds: string[];
  filterAgentNames: string[];
  irisCustomerId: number | null;
  irisCustomerName: string;
  totalMongoIncidents: number;
  totalMongoVulns: number;
  totalMongoReports: number;
  redisKeysCount: number;
  redisSummaryPresent: boolean;
  redisAudit?: RedisAuditItem;
  dateBreakdown: DateRow[];
  dateBreakdownAlerts?: DateRow[];
  dateBreakdownVulns?: DateRow[];
}

interface IrisCaseItem {
  case_id: number;
  title: string;
  date: string;
  customer_name: string;
  in_iris: boolean;
  in_mongo: boolean;
  is_in_sync: boolean;
}

interface IrisTenantItem {
  tenant_code: string;
  tenant_name?: string;
  campus_name?: string;
  database_name: string;
  iris_cases_count: number;
  mongo_reports_count: number;
  is_in_sync: boolean;
  cases: IrisCaseItem[];
}

type TabType = 'alerts' | 'vulnerabilities' | 'redis' | 'iris' | 'cronjob';

export default function DataSyncPage() {
  const [tenants, setTenants] = useState<TenantAuditItem[]>([]);
  const [masterTenants, setMasterTenants] = useState<{ id: number; tenantCode: string; tenantName: string }[]>([]);
  const [irisData, setIrisData] = useState<{ is_in_sync: boolean; tenants: IrisTenantItem[] } | null>(null);
  const [cronConfig, setCronConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Top Bar State: Time Period & Tenant
  const [selectedPeriod, setSelectedPeriod] = useState<string>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [selectedTenant, setSelectedTenant] = useState<string>('all');

  // 5 Tabs: Alerts | Vulnerabilities | Redis | IRIS | CronJob
  const [activeTab, setActiveTab] = useState<TabType>('alerts');

  // Script Action States
  const [runningAction, setRunningAction] = useState<string | null>(null);

  // Cronjob State
  const [cronEnabled, setCronEnabled] = useState<boolean>(true);
  const [cronSchedule, setCronSchedule] = useState<string>('0 * * * *');
  const [savingCron, setSavingCron] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const toggleCard = (id: string) => setCollapsedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAuditData = async (
    period = selectedPeriod,
    tenant = selectedTenant,
    start = customStartDate,
    end = customEndDate
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (tenant) params.set('tenant', tenant);
      if (period === 'CUSTOM') {
        if (start) params.set('startDate', start);
        if (end) params.set('endDate', end);
      }

      const res = await fetch(`/api/data-sync?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setTenants(json.auditResults || []);
        if (json.allTenants && Array.isArray(json.allTenants) && json.allTenants.length > 0) {
          setMasterTenants(json.allTenants);
        } else if (masterTenants.length === 0 && json.auditResults?.length > 0) {
          setMasterTenants(
            json.auditResults.map((t: any) => ({
              id: t.id,
              tenantCode: t.tenantCode,
              tenantName: t.tenantName || t.campusName || t.tenantCode,
            }))
          );
        }
        if (json.irisAudit) {
          setIrisData(json.irisAudit);
        }
        if (json.cronConfig) {
          setCronConfig(json.cronConfig);
          setCronEnabled(json.cronConfig.enabled);
          setCronSchedule(json.cronConfig.schedule || '0 * * * *');
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load audit data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'redis' && selectedPeriod !== 'TODAY' && selectedPeriod !== 'THIS_WEEK') {
      setSelectedPeriod('THIS_WEEK');
    }
  }, [activeTab, selectedPeriod]);

  useEffect(() => {
    fetchAuditData(selectedPeriod, selectedTenant, customStartDate, customEndDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedTenant]);

  // Trigger Check
  const handleRunCheck = async (checkScript: string) => {
    setRunningAction(checkScript);
    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-check',
          checkScript,
          period: selectedPeriod,
          startDate: selectedPeriod === 'CUSTOM' ? customStartDate : undefined,
          endDate: selectedPeriod === 'CUSTOM' ? customEndDate : undefined,
          tenant: selectedTenant,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to execute audit verification');
      }

      showToast(json.message || 'Audit verification completed');
      fetchAuditData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRunningAction(null);
    }
  };

  // Trigger Sync
  const handleRunSync = async (pipeline: string) => {
    setRunningAction(`sync-${pipeline}`);
    try {
      const res = await fetch('/api/data-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run-sync',
          pipeline,
          tenant: selectedTenant,
          period: selectedPeriod,
          startDate: selectedPeriod === 'CUSTOM' ? customStartDate : undefined,
          endDate: selectedPeriod === 'CUSTOM' ? customEndDate : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to execute sync');
      }

      showToast(json.message || 'Synchronization executed successfully');
      fetchAuditData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRunningAction(null);
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

      showToast(json.message || 'Cronjob configuration saved successfully');
      if (json.cronConfig) {
        setCronConfig(json.cronConfig);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingCron(false);
    }
  };

  const displayedTenants = selectedTenant === 'all'
    ? tenants
    : tenants.filter((t) => t.tenantCode === selectedTenant);

  const displayedIrisTenants = irisData?.tenants
    ? selectedTenant === 'all'
      ? irisData.tenants
      : irisData.tenants.filter((t) => t.tenant_code === selectedTenant)
    : [];

  const totalIncidents = displayedTenants.reduce((s, t) => s + (t.totalMongoIncidents || 0), 0);
  const totalVulns = displayedTenants.reduce((s, t) => s + (t.totalMongoVulns || 0), 0);
  const totalReports = displayedIrisTenants.reduce((s, t) => s + (t.mongo_reports_count || 0), 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-in fade-in slide-in-from-top-3 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800">
          Data Synchronization & Audit
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Audit and reconcile multi-tenant telemetry pipelines across Wazuh Indexer, MongoDB, Redis, and DFIR-IRIS.
        </p>
      </div>

      {/* TOP BAR: TIME PERIOD & TENANT SELECTOR */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Time Period label & pills */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 pr-2 border-r border-slate-200">
            Time Period
          </span>

          <div className="flex flex-wrap items-center gap-1 bg-[#F0F4F8] p-1 rounded-xl">
            {(activeTab === 'redis'
              ? [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'THIS_WEEK', label: 'This Week' },
                ]
              : [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'THIS_WEEK', label: 'This Week' },
                  { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
                  { id: 'CUSTOM', label: 'Custom Date' },
                ]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPeriod(p.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedPeriod === p.id
                    ? 'bg-white text-[#00BCD4] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs */}
          {activeTab !== 'redis' && selectedPeriod === 'CUSTOM' && (
            <div className="flex items-center gap-2 bg-[#F0F4F8] px-2.5 py-1 rounded-xl border border-slate-200/60">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="text-xs font-mono font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#00BCD4]"
              />
              <span className="text-xs text-slate-400 font-semibold">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="text-xs font-mono font-medium text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#00BCD4]"
              />
              <button
                onClick={() => fetchAuditData('CUSTOM', selectedTenant, customStartDate, customEndDate)}
                className="px-2.5 py-1 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-lg transition cursor-pointer"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Right: Tenant Selector & Refresh */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <span className="text-xs font-bold text-slate-600">Tenant:</span>
          <CustomSelect
            value={selectedTenant}
            onChange={(val) => setSelectedTenant(String(val))}
            options={[
              { value: 'all', label: 'All Tenants', badge: 'ALL' },
              ...(masterTenants.length > 0 ? masterTenants : tenants).map((t) => ({
                value: t.tenantCode,
                label: `[${t.tenantCode}] ${t.tenantName || (t as any).campusName || t.tenantCode}`,
                badge: t.tenantCode,
              })),
            ]}
            className="min-w-[210px]"
            buttonClassName="min-w-[210px]"
          />

          <button
            onClick={() => fetchAuditData(selectedPeriod, selectedTenant, customStartDate, customEndDate)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 shadow-2xs rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00BCD4]' : ''}`} />
            <span>{loading ? 'Auditing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 3 TOP KPI CARDS (NO PIPELINE PARITY, NO SUBTEXT, NO BADGE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Security Incidents */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Security Incidents
          </span>
          <div className="my-2">
            <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {loading ? '...' : totalIncidents.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Card 2: Vulnerabilities */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Vulnerabilities
          </span>
          <div className="my-2">
            <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {loading ? '...' : totalVulns.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Card 3: Investigation Cases */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Investigation Cases
          </span>
          <div className="my-2">
            <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
              {loading ? '...' : totalReports.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 5 TABS NAVIGATION: Alerts | Vulnerabilities | Redis | IRIS | CronJob */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/80 pb-2">
        {[
          { id: 'alerts', label: 'Alerts' },
          { id: 'vulnerabilities', label: 'Vulnerabilities' },
          { id: 'redis', label: 'Redis' },
          { id: 'iris', label: 'IRIS' },
          { id: 'cronjob', label: 'CronJob' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-[#00BCD4] border border-slate-200/80 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ========================================================= */}
      {/* TAB 1: ALERTS (SECURITY INCIDENTS LEVEL >= 7)             */}
      {/* ========================================================= */}
      {activeTab === 'alerts' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Action Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Indexer - MongoDB (Alerts)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Security Alerts (rule.level ≥ 7)
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunSync('indexer-mongo-alerts')}
                disabled={Boolean(runningAction)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {runningAction === 'sync-indexer-mongo-alerts' ? 'Syncing...' : 'Run Alerts Sync'}
              </button>
            </div>
          </div>

          {/* Alerts Data Tables */}
          {loading ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : displayedTenants.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-6 text-center text-slate-400 text-xs">
              No tenant matching filter.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedTenants.map((t) => {
                const breakdown = t.dateBreakdownAlerts || t.dateBreakdown || [];
                const totalIndexer = breakdown.reduce((sum, r) => sum + (r.indexerMaster || 0), 0);
                const totalMongo = breakdown.reduce((sum, r) => sum + (r.totalMongo || 0), 0);

                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200/70 shadow-xs overflow-hidden"
                  >
                    {/* Header (Clickable Accordion) */}
                    <div
                      onClick={() => toggleCard(`alerts-${t.id || t.tenantCode}`)}
                      className="p-3.5 bg-[#F8FAFC] border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                    >
                      <div className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                        <span className="text-slate-400">
                          {collapsedCards[`alerts-${t.id || t.tenantCode}`] ? (
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-slate-600" />
                          )}
                        </span>
                        <span>[{t.tenantCode}] {t.tenantName || t.campusName}</span>
                        <span className="text-slate-300 font-normal">|</span>
                        <span className="font-mono text-slate-600 font-normal text-xs">Database: {t.databaseName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500">
                          Wazuh Group: {JSON.stringify(t.wazuhGroups)}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200/60 text-slate-700">
                          {collapsedCards[`alerts-${t.id || t.tenantCode}`] ? 'Expand' : 'Collapse'}
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    {!collapsedCards[`alerts-${t.id || t.tenantCode}`] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-sm">
                          <thead className="bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4 rounded-l-xl">DATE</th>
                              <th className="py-3 px-4">INDEXER MASTER</th>
                              <th className="py-3 px-4">TOTAL MONGO</th>
                              <th className="py-3 px-4 rounded-r-xl text-right">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {breakdown.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-slate-400 font-sans italic text-sm">
                                  No security alerts found for this period.
                                </td>
                              </tr>
                            ) : (
                              breakdown.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-3 px-4 font-semibold text-slate-900">{row.date}</td>
                                  <td className="py-3 px-4 font-semibold text-slate-800">{row.indexerMaster}</td>
                                  <td className="py-3 px-4 font-semibold text-slate-800">{row.totalMongo}</td>
                                  <td className="py-3 px-4 text-right">
                                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                      row.status === 'SYNC'
                                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                        : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                                    }`}>
                                      {row.status}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                            <tr className="bg-slate-50 font-bold border-t border-slate-200 text-sm">
                              <td className="py-3 px-4 font-black text-slate-900">TOTAL</td>
                              <td className="py-3 px-4 text-blue-700 font-black">{totalIndexer}</td>
                              <td className="py-3 px-4 text-blue-700 font-black">{totalMongo}</td>
                              <td className="py-3 px-4 text-right text-emerald-700 font-black">
                                {totalIndexer === totalMongo ? '100% SYNC' : 'MISMATCH'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: VULNERABILITIES (MEDIUM - CRITICAL)                */}
      {/* ========================================================= */}
      {activeTab === 'vulnerabilities' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Action Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Indexer - MongoDB (Vulnerabilities)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Package Vulnerabilities (Medium - Critical)
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunSync('vulnerabilities')}
                disabled={Boolean(runningAction)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {runningAction === 'sync-vulnerabilities' ? 'Syncing...' : 'Run Vulnerabilities Sync'}
              </button>
            </div>
          </div>

          {/* Vulnerabilities Data Tables */}
          {loading ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : displayedTenants.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-6 text-center text-slate-400 text-xs">
              No tenant matching filter.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedTenants.map((t) => {
                const breakdown = t.dateBreakdownVulns || [];
                const totalIndexer = breakdown.reduce((sum, r) => sum + (r.indexerMaster || 0), 0);
                const totalMongo = breakdown.reduce((sum, r) => sum + (r.totalMongo || 0), 0);

                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200/70 shadow-xs overflow-hidden"
                  >
                    {/* Header (Clickable Accordion) */}
                    <div
                      onClick={() => toggleCard(`vulns-${t.id || t.tenantCode}`)}
                      className="p-3.5 bg-[#F8FAFC] border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                    >
                      <div className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                        <span className="text-slate-400">
                          {collapsedCards[`vulns-${t.id || t.tenantCode}`] ? (
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-slate-600" />
                          )}
                        </span>
                        <span>[{t.tenantCode}] {t.tenantName || t.campusName}</span>
                        <span className="text-slate-300 font-normal">|</span>
                        <span className="font-mono text-slate-600 font-normal text-xs">Database: {t.databaseName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-500">
                          Wazuh Group: {JSON.stringify(t.wazuhGroups)}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200/60 text-slate-700">
                          {collapsedCards[`vulns-${t.id || t.tenantCode}`] ? 'Expand' : 'Collapse'}
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    {!collapsedCards[`vulns-${t.id || t.tenantCode}`] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-sm">
                          <thead className="bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4 rounded-l-xl">DATE</th>
                              <th className="py-3 px-4">INDEXER MASTER</th>
                              <th className="py-3 px-4">TOTAL MONGO</th>
                              <th className="py-3 px-4 rounded-r-xl text-right">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {breakdown.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="py-4 text-center text-slate-400 font-sans italic text-sm">
                                  No vulnerabilities found for this period.
                                </td>
                              </tr>
                            ) : (
                              breakdown.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                  <td className="py-3 px-4 font-semibold text-slate-900">{row.date}</td>
                                  <td className="py-3 px-4 font-semibold text-slate-800">{row.indexerMaster}</td>
                                  <td className="py-3 px-4 font-semibold text-slate-800">{row.totalMongo}</td>
                                  <td className="py-3 px-4 text-right">
                                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                      row.status === 'SYNC'
                                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                        : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                                    }`}>
                                      {row.status}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            )}
                            <tr className="bg-slate-50 font-bold border-t border-slate-200 text-sm">
                              <td className="py-3 px-4 font-black text-slate-900">TOTAL</td>
                              <td className="py-3 px-4 text-blue-700 font-black">{totalIndexer}</td>
                              <td className="py-3 px-4 text-blue-700 font-black">{totalMongo}</td>
                              <td className="py-3 px-4 text-right text-emerald-700 font-black">
                                {totalIndexer === totalMongo ? '100% SYNC' : 'MISMATCH'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: REDIS (MONGO-REDIS MULTI-COLLECTION PARITY)        */}
      {/* ========================================================= */}
      {activeTab === 'redis' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Action Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                MongoDB - Redis Cache Reconciliation
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Audit across all collections: incident, vulnerability, reports, and devices
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunSync('mongo-redis')}
                disabled={Boolean(runningAction)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {runningAction === 'sync-mongo-redis' ? 'Syncing...' : 'Run Redis Sync'}
              </button>
            </div>
          </div>

          {/* Redis Collection Parity Tables per Tenant */}
          {loading ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : displayedTenants.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-6 text-center text-slate-400 text-xs">
              No tenant matching filter.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedTenants.map((t) => {
                const ra = t.redisAudit;
                const isAllSynced = ra?.isAllSynced ?? false;

                const collections = [
                  {
                    name: 'Security Incidents (incident)',
                    detail: 'Daily hash (Event Based)',
                    mongo: ra?.incidents?.mongo ?? t.totalMongoIncidents,
                    redis: ra?.incidents?.redis ?? 0,
                    isSynced: ra?.incidents?.isSynced ?? (t.totalMongoIncidents === 0),
                  },
                  {
                    name: 'Package Vulnerabilities (vulnerability)',
                    detail: 'This Week Cache (Wazuh Vulnerabilities)',
                    mongo: ra?.vulnerabilities?.mongo ?? 0,
                    redis: ra?.vulnerabilities?.redis ?? 0,
                    isSynced: ra?.vulnerabilities?.isSynced ?? ((ra?.vulnerabilities?.mongo ?? 0) === (ra?.vulnerabilities?.redis ?? 0)),
                  },
                  {
                    name: 'Investigation Reports (reports)',
                    detail: 'DFIR-IRIS Investigation Reports',
                    mongo: ra?.reports?.mongo ?? 0,
                    redis: ra?.reports?.redis ?? 0,
                    isSynced: ra?.reports?.isSynced ?? true,
                  },
                  {
                    name: 'Device Inventory (devices)',
                    detail: 'Wazuh Agent Device Inventory',
                    mongo: ra?.devices?.mongo ?? 0,
                    redis: ra?.devices?.redis ?? 0,
                    isSynced: ra?.devices?.isSynced ?? true,
                  },
                ];

                return (
                  <div
                    key={t.id}
                    className="bg-white rounded-2xl border border-slate-200/70 shadow-xs overflow-hidden"
                  >
                    {/* Header (Clickable Accordion) */}
                    <div
                      onClick={() => toggleCard(`redis-${t.id || t.tenantCode}`)}
                      className="p-3.5 bg-[#F8FAFC] border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                    >
                      <div className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                        <span className="text-slate-400">
                          {collapsedCards[`redis-${t.id || t.tenantCode}`] ? (
                            <ChevronDown className="w-4 h-4 text-slate-600" />
                          ) : (
                            <ChevronUp className="w-4 h-4 text-slate-600" />
                          )}
                        </span>
                        <span>[{t.tenantCode}] {(t.tenantName || t.campusName || '').toUpperCase()}</span>
                        <span className="text-slate-300 font-normal">|</span>
                        <span className="font-mono text-slate-600 font-normal text-xs">Database: {t.databaseName}</span>
                        <span className="text-slate-300 font-normal">|</span>
                        <span className="font-mono text-indigo-600 font-semibold text-xs">Redis: {t.redisPrefix}*</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                          isAllSynced
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            : 'text-rose-700 bg-rose-50 border border-rose-200'
                        }`}>
                          {isAllSynced ? '100% IN SYNC' : 'DISCREPANCY DETECTED'}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200/60 text-slate-700">
                          {collapsedCards[`redis-${t.id || t.tenantCode}`] ? 'Expand' : 'Collapse'}
                        </span>
                      </div>
                    </div>

                    {/* Parity Table */}
                    {!collapsedCards[`redis-${t.id || t.tenantCode}`] && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-mono text-sm">
                          <thead className="bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                            <tr>
                              <th className="py-3 px-4 rounded-l-xl">COLLECTION / TELEMETRY METRIC</th>
                              <th className="py-3 px-4">MONGO MASTER</th>
                              <th className="py-3 px-4">REDIS CACHE</th>
                              <th className="py-3 px-4 rounded-r-xl text-right">STATUS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-800">
                            {collections.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-3.5 px-4 font-sans">
                                  <div className="font-semibold text-slate-900 text-sm">{item.name}</div>
                                  <div className="text-xs text-slate-400 font-mono">{item.detail}</div>
                                </td>
                                <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">{item.mongo}</td>
                                <td className="py-3.5 px-4 font-bold text-indigo-600 text-sm">{item.redis}</td>
                                <td className="py-3.5 px-4 pr-4 text-right font-sans">
                                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                    item.isSynced
                                      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                      : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                                  }`}>
                                    {item.isSynced ? (item.mongo === 0 ? 'SYNCED (0)' : '100% IN SYNC') : 'MISMATCH'}
                                  </span>
                                </td>
                              </tr>
                            ))}

                            {/* Historical Stats KPI Row */}
                            <tr className="hover:bg-slate-50">
                              <td className="py-3.5 px-4 font-sans">
                                <div className="font-semibold text-slate-900 text-sm">Historical Stats (Weekly KPI)</div>
                                <div className="text-xs text-slate-400 font-mono">14-day aggregated telemetry KPIs</div>
                              </td>
                              <td className="py-3.5 px-4 font-medium text-slate-700 text-sm font-sans">Available</td>
                              <td className="py-3.5 px-4 font-medium text-indigo-600 text-sm font-sans">
                                {ra?.historicalStats?.cached ? 'Cached (Weekly)' : 'No Cache'}
                              </td>
                              <td className="py-3.5 px-4 pr-4 text-right font-sans">
                                <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                  ra?.historicalStats?.cached
                                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                    : 'text-amber-700 bg-amber-50 border border-amber-200/60'
                                }`}>
                                  {ra?.historicalStats?.cached ? 'SYNCED (Weekly KPI)' : 'NO CACHE'}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Incidents Date Breakdown if present */}
                    {!collapsedCards[`redis-${t.id || t.tenantCode}`] && ra?.incidents?.dateBreakdown && ra.incidents.dateBreakdown.length > 0 && (
                      <div className="p-4 bg-slate-50/70 border-t border-slate-200/70">
                        <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
                          <span>Incidents Daily Breakdown (Date Hash Keys)</span>
                          <span className="text-xs text-slate-500 font-mono">
                            Total: Mongo {ra.incidents.mongo} / Redis {ra.incidents.redis}
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
                          <table className="w-full text-left font-mono text-sm">
                            <thead className="bg-slate-100/80 text-slate-800 font-bold border-b border-slate-200 text-xs">
                              <tr>
                                <th className="py-2.5 px-4">DATE</th>
                                <th className="py-2.5 px-4">MONGO MASTER</th>
                                <th className="py-2.5 px-4">REDIS CACHE (7D)</th>
                                <th className="py-2.5 px-4 pr-4 text-right">STATUS</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {ra.incidents.dateBreakdown.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/60">
                                  <td className="py-2.5 px-4 font-semibold text-slate-900">{row.date}</td>
                                  <td className="py-2.5 px-4 font-semibold text-slate-800">{row.mongo}</td>
                                  <td className="py-2.5 px-4 font-semibold text-indigo-700">{row.redis}</td>
                                  <td className="py-2.5 px-4 pr-4 text-right font-sans">
                                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                      row.status === 'SYNC'
                                        ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                        : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                                    }`}>
                                      {row.status === 'SYNC' ? (row.mongo === 0 ? 'SYNCED (0)' : '100% IN SYNC') : 'MISMATCH'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: IRIS (DFIR-IRIS REPORTS AUDIT)                      */}
      {/* ========================================================= */}
      {activeTab === 'iris' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Action Bar */}
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                DFIR-IRIS - MongoDB
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Investigation Case Reports
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleRunSync('iris-mongo')}
                disabled={Boolean(runningAction)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                {runningAction === 'sync-iris-mongo' ? 'Syncing...' : 'Run IRIS Sync'}
              </button>
            </div>
          </div>

          {/* IRIS Cases per Tenant */}
          {loading ? (
            <div className="p-6 bg-white rounded-2xl border border-slate-200 space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : displayedIrisTenants.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-6 text-center text-slate-400 text-xs">
              No IRIS case records found for this period.
            </div>
          ) : (
            <div className="space-y-4">
              {displayedIrisTenants.map((t) => (
                <div
                  key={t.tenant_code}
                  className="bg-white rounded-2xl border border-slate-200/70 shadow-xs overflow-hidden"
                >
                  {/* Tenant Card Header (Clickable Accordion) */}
                  <div
                    onClick={() => toggleCard(`iris-${t.tenant_code}`)}
                    className="p-3.5 bg-[#F8FAFC] border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/70 transition-colors select-none"
                  >
                    <div className="font-bold text-slate-800 text-sm tracking-tight flex items-center gap-2">
                      <span className="text-slate-400">
                        {collapsedCards[`iris-${t.tenant_code}`] ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronUp className="w-4 h-4 text-slate-600" />
                        )}
                      </span>
                      <span>[{t.tenant_code}] {(t.tenant_name || t.campus_name || '').toUpperCase()}</span>
                      <span className="text-slate-300 font-normal">|</span>
                      <span className="font-mono text-slate-600 font-normal text-xs">Database: {t.database_name}.reports</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-700 bg-white border border-slate-200 px-2.5 py-0.5 rounded-md font-semibold">
                        IRIS: {t.iris_cases_count} | MongoDB: {t.mongo_reports_count}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${
                        t.is_in_sync
                          ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                          : 'text-rose-700 bg-rose-50 border border-rose-200'
                      }`}>
                        {t.is_in_sync ? '100% SYNC' : 'MISMATCH'}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200/60 text-slate-700">
                        {collapsedCards[`iris-${t.tenant_code}`] ? 'Expand' : 'Collapse'}
                      </span>
                    </div>
                  </div>

                  {/* Cases Table */}
                  {!collapsedCards[`iris-${t.tenant_code}`] && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left font-mono text-sm">
                        <thead className="bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                          <tr>
                            <th className="py-3 px-4 rounded-l-xl w-24">ID</th>
                            <th className="py-3 px-4">CASE TITLE</th>
                            <th className="py-3 px-4 w-32">DATE</th>
                            <th className="py-3 px-4 w-48">CUSTOMER NAME</th>
                            <th className="py-3 px-4 rounded-r-xl text-right w-28">STATUS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-800">
                          {t.cases.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-4 pl-4 text-center text-slate-400 font-sans italic text-sm">
                                (No cases recorded for this period)
                              </td>
                            </tr>
                          ) : (
                            t.cases.map((c, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-bold text-[#00BCD4]">
                                  #{c.case_id}
                                </td>
                                <td className="py-3 px-4 font-sans font-semibold text-slate-900 truncate max-w-md text-sm">
                                  {c.title}
                                </td>
                                <td className="py-3 px-4 text-slate-700 font-mono font-semibold text-sm">
                                  {c.date}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-800 font-medium text-sm">
                                  {c.customer_name}
                                </td>
                                <td className="py-3 px-4 pr-4 text-right font-sans">
                                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                                    c.is_in_sync
                                      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200/60'
                                      : 'text-rose-700 bg-rose-50 border border-rose-200/60'
                                  }`}>
                                    {c.is_in_sync ? 'SYNCED' : 'UNSYNC'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: CRONJOB CONFIGURATION                              */}
      {/* ========================================================= */}
      {activeTab === 'cronjob' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs max-w-2xl space-y-4 animate-in fade-in duration-200">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Cron Job Configuration
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Automated multi-tenant background synchronization schedule
            </p>
          </div>

          {/* Toggle Enable */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/60">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Automated Sync Schedule</span>
              <span className="text-[11px] text-slate-500">
                Periodic execution via background crontab
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cronEnabled}
                onChange={(e) => setCronEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00BCD4]"></div>
            </label>
          </div>

          {/* Frequency Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Schedule Frequency (Cron Expression)
            </label>
            <CustomSelect
              value={cronSchedule}
              onChange={(val) => setCronSchedule(String(val))}
              disabled={!cronEnabled}
              options={[
                { value: '0 * * * *', label: 'Every 1 Hour (Standard Pipeline Default)', badge: '0 * * * *' },
                { value: '*/30 * * * *', label: 'Every 30 Minutes', badge: '*/30 * * * *' },
                { value: '*/15 * * * *', label: 'Every 15 Minutes', badge: '*/15 * * * *' },
                { value: '*/5 * * * *', label: 'Every 5 Minutes (Testing / Rapid Sync)', badge: '*/5 * * * *' },
                { value: '0 0 * * *', label: 'Daily at Midnight', badge: '0 0 * * *' },
              ]}
              className="w-full"
            />
          </div>

          {/* Schedule Info */}
          <div className="bg-[#F8FAFC] border border-slate-200/60 rounded-xl p-3 text-xs space-y-1.5 font-mono text-slate-700">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-sans">Target Server:</span>
              <span className="font-bold text-slate-800">10.20.100.86 (Production Master)</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-sans">Last Executed:</span>
              <span className="font-bold text-slate-800">
                {cronConfig?.lastRunAt
                  ? new Date(cronConfig.lastRunAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '15 mins ago'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400 font-sans">Next Run:</span>
              <span className="font-bold text-[#00BCD4]">
                {cronConfig?.nextRunAt
                  ? new Date(cronConfig.nextRunAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'in 1 hour'}
              </span>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveCron}
            disabled={savingCron}
            className="w-full py-2 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer shadow-xs"
          >
            {savingCron ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}
