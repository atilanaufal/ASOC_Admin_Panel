'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Server,
  RefreshCw,
  Search,
  Terminal,
  Building2,
  CheckCircle2,
  AlertCircle,
  X,
  Radio,
} from 'lucide-react';
import { AgentMappingTable } from '@/components/agents/AgentMappingTable';
import { UnassignedAgentAlert } from '@/components/agents/UnassignedAgentAlert';
import { EnrollmentScriptModal } from '@/components/agents/EnrollmentScriptModal';
import type { MappedAgentItem } from '@/app/api/wazuh/agents/route';

export default function AgentMappingPage() {
  const [agents, setAgents] = useState<MappedAgentItem[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disconnected' | 'unassigned'>('all');
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('all');

  // Modals state
  const [isEnrollmentModalOpen, setIsEnrollmentModalOpen] = useState(false);
  const [defaultTenantForEnroll, setDefaultTenantForEnroll] = useState<string>('UI');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAgents = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/wazuh/agents');
      if (res.ok) {
        const json = await res.json();
        setAgents(json.agents || []);
        setTenants(json.tenants || []);
        setSummary(json.summary || null);
        if (isManual) {
          showToast('Inventaris agen Wazuh updated successfully.');
        }
      }
    } catch (err: any) {
      console.error('Error fetching agents:', err);
      showToast('Failed to load Wazuh agent inventory.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleUpdateMapping = async (agentId: string, agentName: string, tenantCode: string) => {
    try {
      const res = await fetch('/api/wazuh/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          agentName,
          tenantCode,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update agent mapping');
      }

      showToast(json.message || `Agen ${agentId} mapped successfully to ${tenantCode}.`);
      fetchAgents();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Filtered agents
  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      !searchQuery.trim() ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.includes(searchQuery.trim()) ||
      a.ip.includes(searchQuery.trim()) ||
      (a.assignedTenant?.campusName || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && a.status === 'active') ||
      (statusFilter === 'disconnected' && a.status !== 'active') ||
      (statusFilter === 'unassigned' && !a.isMapped);

    const matchesCampus =
      selectedCampusFilter === 'all' ||
      a.assignedTenant?.tenantCode === selectedCampusFilter;

    return matchesSearch && matchesStatus && matchesCampus;
  });

  const unassignedCount = summary?.unassigned ?? agents.filter((a) => !a.isMapped).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              <span>Wazuh Agent Mapping & Endpoint Telemetry</span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            Live agent inventory from Wazuh REST API (:55000) and campus database group bindings.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAgents(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsEnrollmentModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Terminal className="w-4 h-4" />
            <span>Agent Enrollment Script</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unassigned Agent Alert Banner */}
      <UnassignedAgentAlert
        unassignedCount={unassignedCount}
        onFilterUnassigned={() => setStatusFilter('unassigned')}
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Agentsts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Wazuh Agents</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '-' : summary?.total || agents.length}
            </div>
            <span className="text-[11px] text-blue-500 font-semibold mt-1 block">Wazuh Manager :55000</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Server className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Active Agents */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Active Agents (Online)</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {loading ? '-' : summary?.active || agents.filter((a) => a.status === 'active').length}
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold mt-1 block">Normal Heartbeat</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <Radio className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Disconnected Agents */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Disconnected Agents</span>
            <div className="text-2xl font-extrabold text-slate-600 mt-1">
              {loading ? '-' : summary?.disconnected || 0}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Offline / No Keepalive</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center font-bold">
            <Server className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Unassigned */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Unassigned / Unmapped</span>
            <div
              className={`text-2xl font-extrabold mt-1 ${
                unassignedCount > 0 ? 'text-amber-500' : 'text-slate-400'
              }`}
            >
              {loading ? '-' : unassignedCount}
            </div>
            <span className="text-[11px] text-amber-500 font-semibold mt-1 block">Requires Campus Binding</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agent ID, name, IP, campus..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status & Campus Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              All ({agents.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('unassigned')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'unassigned'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Unassigned ({unassignedCount})
            </button>
          </div>

          {/* Campus Selector Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <select
              value={selectedCampusFilter}
              onChange={(e) => setSelectedCampusFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer text-xs"
            >
              <option value="all">All Campuses</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.tenantCode}>
                  {t.campusName} ({t.tenantCode})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Agent Mapping Table */}
      <AgentMappingTable
        agents={filteredAgents}
        tenants={tenants}
        loading={loading}
        onUpdateMapping={handleUpdateMapping}
        onOpenEnrollmentModal={(code) => {
          if (code) setDefaultTenantForEnroll(code);
          setIsEnrollmentModalOpen(true);
        }}
      />

      {/* Modal: Enrollment Script Generator */}
      <EnrollmentScriptModal
        isOpen={isEnrollmentModalOpen}
        onClose={() => setIsEnrollmentModalOpen(false)}
        tenants={tenants}
        defaultTenantCode={defaultTenantForEnroll}
      />
    </div>
  );
}
