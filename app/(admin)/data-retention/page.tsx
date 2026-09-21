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
  RotateCcw,
} from 'lucide-react';
import { MorphismSummary } from '@/components/ui/MorphismSummary';
import CustomSelect from '@/components/ui/CustomSelect';

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
  const [redisHoursInput, setRedisHoursInput] = useState<number>(168); // Standard 7 Days = 168 Hours
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
      setRedisHoursInput(Math.round((globalPolicy?.redisTtlSeconds || 604800) / 3600));
    } else {
      setMongoDaysInput(t.mongoTtlDays || 30);
      setRedisHoursInput(Math.round((t.redisTtlSeconds || 604800) / 3600));
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

  const handleResetDefault = async () => {
    if (!confirm('Reset all retention policies to remote scripts standard default (MongoDB: 30 Days, Redis: 7 Days)?')) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-default' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Reset to defaults successful.');
        fetchData();
      } else {
        throw new Error(data.error || 'Failed to reset defaults');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setRefreshing(false);
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

  const totalRedisKeys = tenants.reduce((sum, t) => sum + t.redisKeysCount, 0);

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

      {/* Morphism Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800">
            Data Retention & TTL Lifecycle Policies
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Safe automated lifecycle configuration for MongoDB telemetry data and Redis cache expiration per-tenant.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={handleResetDefault}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200/80 shadow-2xs rounded-xl transition-all cursor-pointer"
            title="Reset remote scripts TTL to 30d Mongo / 7d Redis default"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Defaults</span>
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 shadow-2xs rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00BCD4]' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => openEditModal('global')}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Clock className="w-4 h-4" />
            <span>Configure Global Policy</span>
          </button>
        </div>
      </div>

      {/* Variative KPI Cards (Clean Morphism Style, No Donut) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Managed Databases
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : tenants.length}
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Isolated Per-Tenant
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            MongoDB TTL Policy
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : `${globalPolicy?.mongoTtlDays ?? 30} Days`}
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Historical Data Horizon
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Redis Cache TTL
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : `${Math.round((globalPolicy?.redisTtlSeconds ?? 604800) / 3600)}h / ${Math.round((globalPolicy?.redisTtlSeconds ?? 604800) / 86400)}d`}
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Standard Default (7 Days)
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Total Telemetry Docs
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : (totalIncidents + totalVulns).toLocaleString()}
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-[#00BCD4] flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Across Collections
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tenant name, tenant code, or database..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 text-xs bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white rounded-xl outline-none border border-transparent focus:border-[#00BCD4] transition-all text-slate-800 placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Retention Policy Table */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Retention Policy Table</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
              {filteredTenants.length}
            </span>
          </div>
        </div>

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
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-xl">Tenant Profile</th>
                  <th className="py-3 px-4">MongoDB Database</th>
                  <th className="py-3 px-4">Stored Documents</th>
                  <th className="py-3 px-4">Disk Capacity</th>
                  <th className="py-3 px-4">MongoDB TTL Policy</th>
                  <th className="py-3 px-4">Default Redis TTL</th>
                  <th className="py-3 px-4 rounded-r-xl text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.map((t) => {
                  const redisHours = Math.round(t.redisTtlSeconds / 3600);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      {/* Campus */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#F0F4F8] border border-slate-200/80 flex items-center justify-center font-mono font-bold text-[#00BCD4] text-xs flex-shrink-0 shadow-2xs">
                            {t.tenantCode}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-xs">{t.campusName}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">Namespace: {t.redisPrefix}</div>
                          </div>
                        </div>
                      </td>

                      {/* DB Name */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 text-[11px]">
                        {t.databaseName}
                      </td>

                      {/* Document Counts */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 text-xs">
                          {t.incidentCount + t.vulnCount} docs
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {t.incidentCount} inc • {t.vulnCount} vuln
                        </div>
                      </td>

                      {/* Disk Size */}
                      <td className="py-3.5 px-4 font-mono text-slate-600 text-xs font-bold">
                        {t.diskFormatted}
                      </td>

                      {/* Mongo TTL */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-50 text-[#00BCD4] border border-cyan-100 font-mono">
                          <Clock className="w-3.5 h-3.5 text-[#00BCD4]" />
                          {t.mongoTtlDays} Days
                        </span>
                      </td>

                      {/* Redis TTL */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 font-mono">
                          <Zap className="w-3.5 h-3.5 text-indigo-600" />
                          {redisHours}h ({Math.round(redisHours / 24)}d)
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#00BCD4] bg-cyan-50 hover:bg-cyan-100 rounded-xl transition-all cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/60 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {selectedTenant === 'global' ? 'Configure Global Retention Policy' : `Set TTL: ${selectedTenant.campusName}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedTenant === 'global'
                    ? 'Applies to all tenant databases'
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
                  <span className="font-mono text-[#00BCD4] font-extrabold">{mongoDaysInput} Days</span>
                </label>
                <CustomSelect
                  value={mongoDaysInput}
                  onChange={(val) => setMongoDaysInput(Number(val))}
                  options={[
                    { value: 7, label: '7 Days (1 Week)', badge: '7d' },
                    { value: 14, label: '14 Days (2 Weeks)', badge: '14d' },
                    { value: 30, label: '30 Days (1 Month - Standard Default)', badge: '30d' },
                    { value: 60, label: '60 Days (2 Months)', badge: '60d' },
                    { value: 90, label: '90 Days (3 Months)', badge: '90d' },
                    { value: 180, label: '180 Days (6 Months)', badge: '180d' },
                    { value: 365, label: '365 Days (1 Year)', badge: '365d' },
                  ]}
                  className="w-full mb-2"
                />
                <p className="text-[10px] text-slate-400">
                  Documents older than this threshold will automatically expire via MongoDB TTL indexes on <code className="font-mono text-[#00BCD4]">incident</code>, <code className="font-mono text-[#00BCD4]">vulnerability</code>, and <code className="font-mono text-[#00BCD4]">reports</code>.
                </p>
              </div>

              {/* Redis TTL Hours */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Redis Cache Expiration Duration</span>
                  <span className="font-mono text-indigo-600 font-extrabold">{redisHoursInput} Hours ({Math.round(redisHoursInput / 24)} Days)</span>
                </label>
                <CustomSelect
                  value={redisHoursInput}
                  onChange={(val) => setRedisHoursInput(Number(val))}
                  options={[
                    { value: 24, label: '24 Hours (1 Day)', badge: '24h' },
                    { value: 72, label: '72 Hours (3 Days)', badge: '72h' },
                    { value: 168, label: '168 Hours (7 Days - Standard Default)', badge: '168h' },
                    { value: 336, label: '336 Hours (14 Days)', badge: '336h' },
                    { value: 720, label: '720 Hours (30 Days)', badge: '720h' },
                  ]}
                  className="w-full mb-2"
                />
                <p className="text-[10px] text-slate-400">
                  Directly sets key expiration across tenant Redis namespaces via <code className="font-mono text-indigo-600">/opt/multi-tenant/scripts/set_ttl.py</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedTenant(null)}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePolicy}
                disabled={saving}
                className="px-4 py-2 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
