'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Database,
  Building2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
  X,
  Zap,
  Calendar,
} from 'lucide-react';

interface TenantRetentionItem {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix: string;
  diskBytes: number;
  diskFormatted: string;
  incidentCount: number;
  vulnCount: number;
  redisKeysCount: number;
  mongoTtlDays: number;
  redisTtlSeconds: number;
  policyStatus: string;
}

export default function DataRetentionPage() {
  const [tenants, setTenants] = useState<TenantRetentionItem[]>([]);
  const [globalPolicy, setGlobalPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit Modal State
  const [selectedTenant, setSelectedTenant] = useState<TenantRetentionItem | 'global' | null>(null);
  const [mongoDaysInput, setMongoDaysInput] = useState<number>(30);
  const [redisHoursInput, setRedisHoursInput] = useState<number>(24);
  const [saving, setSaving] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/data-retention');
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
        setGlobalPolicy(data.globalPolicy || null);
        if (isManual) showToast('Retention policy data updated successfully.');
      } else {
        throw new Error('Failed to fetch retention policies');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openEditModal = (t: TenantRetentionItem | 'global') => {
    setSelectedTenant(t);
    if (t === 'global') {
      setMongoDaysInput(globalPolicy?.mongoTtlDays || 30);
      setRedisHoursInput(Math.round((globalPolicy?.redisTtlSeconds || 86400) / 3600));
    } else {
      setMongoDaysInput(t.mongoTtlDays || 30);
      setRedisHoursInput(Math.round((t.redisTtlSeconds || 86400) / 3600));
    }
  };

  const handleSavePolicy = async () => {
    if (!selectedTenant) return;
    setSaving(true);

    const isGlobal = selectedTenant === 'global';
    const tenantId = isGlobal ? 'all' : selectedTenant.id;
    const redisTtlSeconds = Number(redisHoursInput) * 3600;

    try {
      const res = await fetch('/api/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          mongoTtlDays: Number(mongoDaysInput),
          redisTtlSeconds,
          targetCollections: ['incident', 'vulnerability', 'alerts'],
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save retention policy');
      }

      showToast(data.message || 'Retention policy applied successfully.');
      setSelectedTenant(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalIncidents = tenants.reduce((acc, t) => acc + t.incidentCount, 0);
  const totalVulns = tenants.reduce((acc, t) => acc + t.vulnCount, 0);

  const filteredTenants = tenants.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.tenantCode.toLowerCase().includes(q) ||
      t.campusName.toLowerCase().includes(q) ||
      t.databaseName.toLowerCase().includes(q)
    );
  });

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

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Data Retention & TTL Policies
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Safe automated lifecycle configuration for MongoDB telemetry data and Redis L1 cache expiration per-tenant.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => openEditModal('global')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Configure Global Policy</span>
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-violet-600' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Multi-Tenant Campuses
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {loading ? '...' : tenants.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">databases</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">All registered campus databases</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600">
              Default MongoDB TTL
            </span>
            <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-violet-600">
              {loading ? '...' : `${globalPolicy?.mongoTtlDays ?? 30} Days`}
            </span>
            <span className="text-xs text-slate-400 font-medium">retention</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Automated expiration via MongoDB TTL index</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Default Redis L1 TTL
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600">
              {loading ? '...' : `${Math.round((globalPolicy?.redisTtlSeconds ?? 86400) / 3600)} Hours`}
            </span>
            <span className="text-xs text-slate-400 font-medium">expiration</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Auto-expire key namespace cache</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              Total Active Documents
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">
              {loading ? '...' : totalIncidents + totalVulns}
            </span>
            <span className="text-xs text-slate-400 font-medium">records</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {totalIncidents} incidents, {totalVulns} vulnerabilities
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search campus name, tenant code, or database..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Retention Policy Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No tenant databases found</h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4 pl-6">Campus Tenant Profile</th>
                  <th className="p-4">MongoDB Database</th>
                  <th className="p-4">Stored Documents</th>
                  <th className="p-4">Disk Capacity</th>
                  <th className="p-4">MongoDB TTL Policy</th>
                  <th className="p-4">Default Redis TTL</th>
                  <th className="p-4 pr-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredTenants.map((t) => {
                  const redisHours = Math.round(t.redisTtlSeconds / 3600);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Campus */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-200/60 flex items-center justify-center font-mono font-bold text-violet-700 text-xs flex-shrink-0">
                            {t.tenantCode}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs">{t.campusName}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Namespace: {t.redisPrefix}</div>
                          </div>
                        </div>
                      </td>

                      {/* DB Name */}
                      <td className="p-4 font-mono text-slate-600 text-[11px]">
                        {t.databaseName}
                      </td>

                      {/* Document Counts */}
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-xs">
                          {t.incidentCount + t.vulnCount} docs
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {t.incidentCount} inc • {t.vulnCount} vuln
                        </div>
                      </td>

                      {/* Disk Size */}
                      <td className="p-4 font-mono text-slate-600 text-xs font-bold">
                        {t.diskFormatted}
                      </td>

                      {/* Mongo TTL */}
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-violet-50 text-violet-800 border border-violet-200/60 font-mono">
                          <Clock className="w-3.5 h-3.5 text-violet-600" />
                          {t.mongoTtlDays} Days
                        </span>
                      </td>

                      {/* Redis TTL */}
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/60 font-mono">
                          <Zap className="w-3.5 h-3.5 text-indigo-600" />
                          {redisHours} Hours ({t.redisTtlSeconds}s)
                        </span>
                      </td>

                      {/* Action */}
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200/60 rounded-xl transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Set TTL</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Edit TTL Policy */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedTenant === 'global' ? 'Configure Global Retention Policy' : `Set TTL: ${selectedTenant.campusName}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedTenant === 'global'
                    ? 'Applies to all campus tenant databases'
                    : `Database: ${selectedTenant.databaseName}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedTenant(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* MongoDB TTL Days */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>MongoDB Document Retention Period (Days)</span>
                  <span className="font-mono text-violet-600 font-extrabold">{mongoDaysInput} Days</span>
                </label>
                <select
                  value={mongoDaysInput}
                  onChange={(e) => setMongoDaysInput(Number(e.target.value))}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-violet-500 mb-2 cursor-pointer"
                >
                  <option value={7}>7 Days (1 Week)</option>
                  <option value={14}>14 Days (2 Weeks)</option>
                  <option value={30}>30 Days (1 Month)</option>
                  <option value={60}>60 Days (2 Months)</option>
                  <option value={90}>90 Days (3 Months)</option>
                  <option value={180}>180 Days (6 Months)</option>
                  <option value={365}>365 Days (1 Year)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  Documents older than this threshold will automatically expire via MongoDB TTL indexes on <code className="font-mono text-violet-600">incident</code> and <code className="font-mono text-violet-600">vulnerability</code> collections.
                </p>
              </div>

              {/* Redis TTL Hours */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Redis L1 Cache Default Expiration (Hours)</span>
                  <span className="font-mono text-indigo-600 font-extrabold">{redisHoursInput} Hours</span>
                </label>
                <select
                  value={redisHoursInput}
                  onChange={(e) => setRedisHoursInput(Number(e.target.value))}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-2 cursor-pointer"
                >
                  <option value={1}>1 Hour (3,600 seconds)</option>
                  <option value={6}>6 Hours (21,600 seconds)</option>
                  <option value={12}>12 Hours (43,200 seconds)</option>
                  <option value={24}>24 Hours (1 Day - 86,400 seconds)</option>
                  <option value={72}>72 Hours (3 Days - 259,200 seconds)</option>
                  <option value={168}>168 Hours (7 Days - 604,800 seconds)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  Redis L1 cache keys for tenant namespaces will automatically expire after this duration to prevent memory bloat.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedTenant(null)}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePolicy}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <span>Apply TTL Policy</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
