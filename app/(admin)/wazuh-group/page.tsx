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
  const [customGroupInput, setCustomGroupInput] = useState<string>('');
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
    setCustomGroupInput('');
  };

  const handleSaveMapping = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    const targetGroup = customGroupInput.trim() ? customGroupInput.trim() : chosenGroup;

    try {
      const res = await fetch('/api/tenant-mapping/wazuh-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          wazuhGroupName: targetGroup,
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
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Wazuh Group to Tenant Mapping
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify and configure bindings between Wazuh Manager groups and campus tenants for multi-tenant telemetry routing.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Campus Tenants
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {loading ? '...' : summary?.totalTenants ?? tenants.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">tenants</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Registered in master MySQL database</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              Mapped Tenants
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">
              {loading ? '...' : summary?.mappedTenants ?? tenants.filter((t) => t.isMapped).length}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              / {tenants.length} campuses
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Active Wazuh group bindings configured</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Groups in Wazuh API
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600">
              {loading ? '...' : availableGroups.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">available groups</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {availableGroups.map((g) => g.name).join(', ') || 'Loading...'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
              Unmapped Tenants
            </span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">
              {loading ? '...' : summary?.unmappedTenants ?? tenants.filter((t) => !t.isMapped).length}
            </span>
            <span className="text-xs text-slate-400 font-medium">campuses</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Pending connection to a Wazuh group</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tenant code, campus name, or Wazuh group..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Mapping Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4 pl-6">Campus Tenant Profile</th>
                  <th className="p-4">SSOT Database</th>
                  <th className="p-4">Mapped Wazuh Group</th>
                  <th className="p-4">Group Agents</th>
                  <th className="p-4">Mapping Status</th>
                  <th className="p-4 pr-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredTenants.map((t) => {
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Campus */}
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center font-mono font-bold text-indigo-700 text-xs flex-shrink-0">
                            {t.tenantCode}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-xs">{t.campusName}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID #{t.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* DB */}
                      <td className="p-4 font-mono text-slate-600 text-[11px]">
                        {t.databaseName}
                      </td>

                      {/* Mapped Wazuh Group */}
                      <td className="p-4">
                        {t.wazuhGroup ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200/60 font-mono">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            {t.wazuhGroup}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Agent Count */}
                      <td className="p-4">
                        <span className="font-bold text-slate-800 text-xs">
                          {t.agentCount}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-1">agents</span>
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        {t.isMapped ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Mapped
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Unmapped
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="p-4 pr-6 text-right">
                        <button
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 rounded-xl transition-all cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
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
                <select
                  value={chosenGroup}
                  onChange={(e) => {
                    setChosenGroup(e.target.value);
                    setCustomGroupInput('');
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">-- Choose Wazuh Group --</option>
                  {availableGroups.map((grp) => (
                    <option key={grp.name} value={grp.name}>
                      {grp.name} ({grp.count} agents)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Or Enter Custom Group Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. TenantA, custom-group"
                  value={customGroupInput}
                  onChange={(e) => {
                    setCustomGroupInput(e.target.value);
                    setChosenGroup('');
                  }}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Binding will be persisted to <code className="font-mono text-indigo-600">tenant_wazuh_groups</code> table.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              {selectedTenant.isMapped ? (
                <button
                  onClick={handleRemoveMapping}
                  disabled={saving}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
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
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={saving || (!chosenGroup && !customGroupInput.trim())}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
