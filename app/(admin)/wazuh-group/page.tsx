'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Building2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Layers,
  X,
} from 'lucide-react';
import { MorphismSummary } from '@/components/ui/MorphismSummary';
import CustomSelect from '@/components/ui/CustomSelect';

interface TenantGroupItem {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  isActive: boolean;
  wazuhGroup: string | null;
  agentCount: number;
  isMapped: boolean;
  mappingId: number | null;
}

interface WazuhGroupOption {
  name: string;
  count: number;
}

export default function WazuhGroupPage() {
  const [tenants, setTenants] = useState<TenantGroupItem[]>([]);
  const [availableGroups, setAvailableGroups] = useState<WazuhGroupOption[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal edit mapping
  const [selectedTenant, setSelectedTenant] = useState<TenantGroupItem | null>(null);
  const [chosenGroup, setChosenGroup] = useState<string>('');
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
      const res = await fetch('/api/tenant-mapping/wazuh-group');
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
        setAvailableGroups(data.availableGroups || []);
        setSummary(data.summary || null);
        if (isManual) showToast('Wazuh group mapping data refreshed successfully.');
      } else {
        throw new Error('Failed to fetch Wazuh group mapping data');
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

  const openEditModal = (t: TenantGroupItem) => {
    setSelectedTenant(t);
    setChosenGroup(t.wazuhGroup || '');
  };

  const handleSaveMapping = async () => {
    if (!selectedTenant || !chosenGroup) return;
    setSaving(true);

    try {
      const res = await fetch('/api/tenant-mapping/wazuh-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          wazuhGroupName: chosenGroup,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save mapping');
      }

      showToast(data.message || 'Mapping saved successfully.');
      setSelectedTenant(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMapping = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tenant-mapping/wazuh-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          wazuhGroupName: '',
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete mapping');
      }

      showToast(data.message || 'Mapping deleted successfully.');
      setSelectedTenant(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.tenantCode.toLowerCase().includes(q) ||
      t.campusName.toLowerCase().includes(q) ||
      t.databaseName.toLowerCase().includes(q) ||
      (t.wazuhGroup && t.wazuhGroup.toLowerCase().includes(q))
    );
  });

  const mappedCount = summary?.mappedTenants ?? tenants.filter((t) => t.isMapped).length;
  const unmappedCount = summary?.unmappedTenants ?? tenants.filter((t) => !t.isMapped).length;
  const coverageRatio = tenants.length > 0 ? Math.round((mappedCount / tenants.length) * 100) : 100;

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
            Wazuh Group to Tenant Mapping
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Verify and configure bindings between Wazuh Manager groups and tenants for multi-tenant telemetry routing.
          </p>
        </div>

        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/60 shadow-xs rounded-xl transition-all disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00BCD4]' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Variative KPI Cards (Clean Morphism Style, No Donut) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Total Tenants
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : tenants.length}
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Registered Tenancies
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Mapped Groups
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : mappedCount}
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-emerald-600">
            Active Routing Bound
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Unmapped Tenants
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : unmappedCount}
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-rose-600">
            Missing Group Filter
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Mapping Coverage
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : `${coverageRatio}%`}
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-[#00BCD4] flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Telemetry Target Sync
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tenant code, tenant name, or Wazuh group..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2.5 bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-[#00BCD4] transition-all"
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

      {/* Mapping Table */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Wazuh Group Mapping Table</h3>
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
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No tenant data found</h3>
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 rounded-l-xl">Tenant Profile</th>
                  <th className="py-3 px-4">Database</th>
                  <th className="py-3 px-4">Wazuh Group</th>
                  <th className="py-3 px-4">Group Agents</th>
                  <th className="py-3 px-4">Mapping Status</th>
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
                            <div className="text-xs text-slate-400 font-mono mt-0.5">ID #{t.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* DB */}
                      <td className="py-3.5 px-4 font-mono text-slate-700 text-sm font-medium">
                        {t.databaseName}
                      </td>

                      {/* Wazuh Group */}
                      <td className="py-3.5 px-4">
                        {t.wazuhGroup ? (
                          <span className="font-mono text-sm font-semibold text-slate-700">
                            {t.wazuhGroup}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-sm">Not Assigned</span>
                        )}
                      </td>

                      {/* Agent Count */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 text-sm">
                          {t.agentCount}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">agents</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {t.isMapped ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Mapped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Unmapped
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#00BCD4] bg-cyan-50 hover:bg-cyan-100 rounded-xl transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit Mapping</span>
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

      {/* Modal Edit Mapping */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200/60 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Map Wazuh Group
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tenant: <span className="font-bold text-slate-800">{selectedTenant.campusName}</span> ({selectedTenant.tenantCode})
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Available Wazuh Group
                </label>
                <CustomSelect
                  value={chosenGroup}
                  onChange={(val) => setChosenGroup(String(val))}
                  options={[
                    { value: '', label: '-- Choose Wazuh Group --' },
                    ...availableGroups.map((grp) => ({
                      value: grp.name,
                      label: grp.name,
                      badge: `${grp.count} agents`,
                    })),
                  ]}
                  placeholder="-- Choose Wazuh Group --"
                  className="w-full"
                />
                <p className="text-[10px] text-slate-400 mt-2">
                  Select from existing Wazuh Manager groups to link agents to this tenant.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {selectedTenant.isMapped ? (
                <button
                  onClick={handleRemoveMapping}
                  disabled={saving}
                  className="px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                >
                  Remove Mapping
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedTenant(null)}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={saving || !chosenGroup}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#00BCD4] hover:bg-[#00ACC1] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Mapping</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
