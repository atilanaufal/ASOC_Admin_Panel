'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Server,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  HardDrive,
  Activity,
} from 'lucide-react';
import type { MappedAgentItem } from '@/app/api/wazuh/agents/route';

export default function AgentStatusPage() {
  const [agents, setAgents] = useState<MappedAgentItem[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disconnected'>('all');
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string>('all');

  const fetchAgents = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/wazuh/agents');
      if (res.ok) {
        const json = await res.json();
        setAgents(json.agents || []);
        setTenants(json.tenants || []);
        setSummary(json.summary || null);
      }
    } catch (err: any) {
      console.error('Error fetching agents:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => fetchAgents(false), 30000);
    return () => clearInterval(interval);
  }, []);

  // Filtered agents
  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      !searchQuery.trim() ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.includes(searchQuery) ||
      (a.ip && a.ip.includes(searchQuery)) ||
      (a.os?.name && a.os.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && a.status === 'active') ||
      (statusFilter === 'disconnected' && a.status !== 'active');

    const matchesCampus =
      selectedCampusFilter === 'all' ||
      (a.assignedTenant && a.assignedTenant.tenantCode === selectedCampusFilter);

    return matchesSearch && matchesStatus && matchesCampus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Wazuh Agents & Telemetry Status
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized monitoring of connection status, telemetry, and live endpoint health.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAgents(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Registered Endpoints
            </span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {loading ? '...' : summary?.total ?? agents.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">agents</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Wazuh sensors deployed on VMs/Servers</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              Active Agents (Online)
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">
              {loading ? '...' : summary?.active ?? agents.filter((a) => a.status === 'active').length}
            </span>
            <span className="text-xs text-slate-400 font-medium">connected</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Actively sending heartbeats & security events</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">
              Disconnected (Offline)
            </span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600">
              {loading ? '...' : summary?.disconnected ?? agents.filter((a) => a.status !== 'active').length}
            </span>
            <span className="text-xs text-slate-400 font-medium">offline</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Heartbeat disconnected or pending activation</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Wazuh Manager
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected (Live)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">REST API :55000 Responsive</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agent ID, hostname, IP, operating system..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({agents.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active ({agents.filter((a) => a.status === 'active').length})
            </button>
            <button
              onClick={() => setStatusFilter('disconnected')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                statusFilter === 'disconnected'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Disconnected ({agents.filter((a) => a.status !== 'active').length})
            </button>
          </div>

          {/* Campus Selector */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCampusFilter}
              onChange={(e) => setSelectedCampusFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Campuses</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.tenantCode}>
                  {t.tenantCode} - {t.campusName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Agents Status Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="p-12 text-center">
            <Server className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">No agents match current filters</h3>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="p-4 pl-6">Agent ID</th>
                  <th className="p-4">Hostname / Endpoint</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4">Operating System</th>
                  <th className="p-4">Wazuh Group</th>
                  <th className="p-4">Mapped Campus</th>
                  <th className="p-4">Last Keep Alive</th>
                  <th className="p-4 pr-6 text-right">Connection Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredAgents.map((agent) => {
                  const isActive = agent.status === 'active';
                  const osName = agent.os?.name || agent.os?.platform || 'Linux';

                  return (
                    <tr key={agent.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* ID */}
                      <td className="p-4 pl-6">
                        <span className="font-mono font-bold text-blue-600 bg-blue-50 border border-blue-200/60 px-2.5 py-1 rounded-md text-[11px]">
                          {agent.id}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="p-4">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                          <span>{agent.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{agent.version}</div>
                      </td>

                      {/* IP */}
                      <td className="p-4 font-mono text-slate-600">{agent.ip || '-'}</td>

                      {/* OS */}
                      <td className="p-4">
                        <div className="text-slate-700 font-medium">{osName}</div>
                        {agent.os?.version && (
                          <div className="text-[10px] text-slate-400">{agent.os.version}</div>
                        )}
                      </td>

                      {/* Wazuh Group */}
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {agent.groups.map((grp) => (
                            <span
                              key={grp}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                            >
                              {grp}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Assigned Tenant (Read-only status) */}
                      <td className="p-4">
                        {agent.assignedTenant ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {agent.assignedTenant.tenantCode} ({agent.assignedTenant.campusName})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-500">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Last Keep Alive */}
                      <td className="p-4 text-slate-500 text-[11px]">
                        {agent.lastKeepAlive || '-'}
                      </td>

                      {/* Status */}
                      <td className="p-4 pr-6 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                              : 'bg-rose-50 text-rose-700 border-rose-200/80'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'
                            }`}
                          />
                          {isActive ? 'Online' : 'Disconnected'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
