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
  redisTtlDays: number;
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
  const [isCustomMongo, setIsCustomMongo] = useState<boolean>(false);
  const [customMongoDays, setCustomMongoDays] = useState<number>(30);

  const [redisDaysInput, setRedisDaysInput] = useState<number>(7);
  const [isCustomRedis, setIsCustomRedis] = useState<boolean>(false);
  const [customRedisDays, setCustomRedisDays] = useState<number>(7);

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
    const mDays = t === 'global' ? (globalPolicy?.mongoTtlDays || 30) : (t.mongoTtlDays || 30);
    const rDays = t === 'global' ? (globalPolicy?.redisTtlDays || 7) : (t.redisTtlDays || 7);

    const isPresetMongo = [7, 14, 30, 60, 90, 180, 365].includes(mDays);
    const isPresetRedis = [1, 3, 7, 14, 30].includes(rDays);

    setMongoDaysInput(isPresetMongo ? mDays : -1);
    setIsCustomMongo(!isPresetMongo);
    setCustomMongoDays(mDays);

    setRedisDaysInput(isPresetRedis ? rDays : -1);
    setIsCustomRedis(!isPresetRedis);
    setCustomRedisDays(rDays);
  };

  const handleSavePolicy = async () => {
    if (!selectedTenant) return;
    setSaving(true);

    const isGlobal = selectedTenant === 'global';
    const tenantId = isGlobal ? 'all' : selectedTenant.id;

    const finalMongoDays = isCustomMongo ? Math.max(1, Number(customMongoDays) || 30) : Number(mongoDaysInput);
    const finalRedisDays = isCustomRedis ? Math.max(1, Number(customRedisDays) || 7) : Number(redisDaysInput);

    try {
      const res = await fetch('/api/data-retention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          mongoTtlDays: finalMongoDays,
          redisDays: finalRedisDays,
          redisTtlSeconds: finalRedisDays * 86400,
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
    if (!confirm('Reset all retention policies to standard default (MongoDB: 30 Days, Redis: 7 Days)?')) return;
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
            title="Reset TTL to 30d Mongo / 7d Redis default"
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
              {loading ? '...' : `${globalPolicy?.redisTtlDays ?? 7} Days`}
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
          <div className="py-16 text-center text-xs font-semibold text-slate-400 animate-pulse">
            Loading retention policy telemetry...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="py-16 text-center text-xs font-semibold text-slate-400">
            No tenant retention policies found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-xl">Tenant Profile</th>
                  <th className="py-3 px-4">MongoDB</th>
                  <th className="py-3 px-4">Stored Documents</th>
                  <th className="py-3 px-4">Disk Capacity</th>
                  <th className="py-3 px-4">MongoDB TTL</th>
                  <th className="py-3 px-4">Redis TTL</th>
                  <th className="py-3 px-4 rounded-r-xl text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTenants.map((t) => {
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      {/* Campus */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[#F0F4F8] border border-slate-200/80 flex items-center justify-center font-mono font-bold text-[#00BCD4] text-xs flex-shrink-0 shadow-2xs">
                            {t.tenantCode}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{t.campusName}</div>
                          </div>
                        </div>
                      </td>

                      {/* DB Name */}
                      <td className="py-3.5 px-4 font-mono text-slate-700 text-sm font-medium">
                        {t.databaseName}
                      </td>

                      {/* Document Counts */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800 text-sm">
                          {(t.incidentCount + t.vulnCount).toLocaleString()} docs
                        </div>
                      </td>

                      {/* Disk Size */}
                      <td className="py-3.5 px-4 font-mono text-slate-700 text-sm font-semibold">
                        {t.diskFormatted}
                      </td>

                      {/* Mongo TTL */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-sm font-semibold text-slate-700">
                          {t.mongoTtlDays} Days
                        </span>
                      </td>

                      {/* Redis TTL */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-sm font-semibold text-slate-700">
                          {t.redisTtlDays || 7} Days
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
                  <span>MongoDB Document Retention Period</span>
                  <span className="font-mono text-[#00BCD4] font-extrabold">
                    {isCustomMongo ? `${customMongoDays} Days (Custom)` : `${mongoDaysInput} Days`}
                  </span>
                </label>
                <CustomSelect
                  value={isCustomMongo ? -1 : mongoDaysInput}
                  onChange={(val) => {
                    const num = Number(val);
                    if (num === -1) {
                      setIsCustomMongo(true);
                    } else {
                      setIsCustomMongo(false);
                      setMongoDaysInput(num);
                    }
                  }}
                  options={[
                    { value: 7, label: '7 Days (1 Week)', badge: '7d' },
                    { value: 14, label: '14 Days (2 Weeks)', badge: '14d' },
                    { value: 30, label: '30 Days (Standard Default)', badge: '30d' },
                    { value: 60, label: '60 Days (2 Months)', badge: '60d' },
                    { value: 90, label: '90 Days (3 Months)', badge: '90d' },
                    { value: 180, label: '180 Days (6 Months)', badge: '180d' },
                    { value: 365, label: '365 Days (1 Year)', badge: '365d' },
                    { value: -1, label: 'Custom Duration...', badge: 'custom' },
                  ]}
                  className="w-full mb-1.5"
                />

                {isCustomMongo && (
                  <div className="flex items-center gap-2 mb-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-600 font-semibold">Custom Days:</span>
                    <input
                      type="number"
                      min="1"
                      max="730"
                      value={customMongoDays}
                      onChange={(e) => setCustomMongoDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#00BCD4]"
                    />
                    <span className="text-xs text-slate-500 font-medium">Days</span>
                  </div>
                )}

                <p className="text-[10px] text-slate-400">
                  Documents older than this threshold will automatically expire via MongoDB TTL indexes.
                </p>
              </div>

              {/* Redis TTL Days (NO HOURS) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>Redis Cache Expiration Duration</span>
                  <span className="font-mono text-indigo-600 font-extrabold">
                    {isCustomRedis ? `${customRedisDays} Days (Custom)` : `${redisDaysInput} Days`}
                  </span>
                </label>
                <CustomSelect
                  value={isCustomRedis ? -1 : redisDaysInput}
                  onChange={(val) => {
                    const num = Number(val);
                    if (num === -1) {
                      setIsCustomRedis(true);
                    } else {
                      setIsCustomRedis(false);
                      setRedisDaysInput(num);
                    }
                  }}
                  options={[
                    { value: 1, label: '1 Day', badge: '1d' },
                    { value: 3, label: '3 Days', badge: '3d' },
                    { value: 7, label: '7 Days (Standard Default)', badge: '7d' },
                    { value: 14, label: '14 Days (2 Weeks)', badge: '14d' },
                    { value: 30, label: '30 Days (1 Month)', badge: '30d' },
                    { value: -1, label: 'Custom Duration...', badge: 'custom' },
                  ]}
                  className="w-full mb-1.5"
                />

                {isCustomRedis && (
                  <div className="flex items-center gap-2 mb-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-600 font-semibold">Custom Days:</span>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={customRedisDays}
                      onChange={(e) => setCustomRedisDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-24 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500 font-medium">Days</span>
                  </div>
                )}

                <p className="text-[10px] text-slate-400">
                  Directly sets key expiration across tenant Redis namespaces.
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
