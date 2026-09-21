'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import type { MappedAgentItem } from '@/app/api/wazuh/agents/route';

export default function AgentStatusPage() {
  const [agents, setAgents] = useState<MappedAgentItem[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('all');

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

  // Compute real values from live data
  const totalAgents = summary?.total ?? agents.length;
  const onlineAgents = summary?.active ?? agents.filter((a) => a.status === 'active').length;
  const offlineAgents = summary?.disconnected ?? agents.filter((a) => a.status !== 'active').length;
  const registeredAgents = agents.filter((a) => a.isMapped).length;
  const notRegisteredAgents = agents.filter((a) => !a.isMapped).length;

  // OS Distribution computed dynamically from live agents
  const OS_PALETTE = [
    '#F97316', // Vibrant Orange (e.g. Ubuntu 24.04)
    '#0066FF', // Vibrant Royal Blue (e.g. Ubuntu 20.04)
    '#8B5CF6', // Vibrant Purple (e.g. Ubuntu 22.04)
    '#10B981', // Vibrant Emerald Green (e.g. Rocky Linux)
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F59E0B', // Amber
    '#6366F1', // Indigo
  ];

  const osMap = new Map<string, number>();
  agents.forEach((a) => {
    let key = 'Other OS';
    if (a.os) {
      const rawName = a.os.name || 'Linux';
      const rawVer = a.os.version || '';
      if (rawName.toLowerCase().includes('ubuntu')) {
        const mm = rawVer.match(/\d+\.\d+/)?.[0];
        key = mm ? `Ubuntu ${mm}` : `Ubuntu ${rawVer.replace(' LTS', '').trim()}`;
      } else if (rawName.toLowerCase().includes('rocky')) {
        key = rawVer ? `Rocky Linux ${rawVer.trim()}` : 'Rocky Linux';
      } else if (rawName.toLowerCase().includes('windows')) {
        key = rawVer ? `Windows ${rawVer.trim()}` : 'Windows';
      } else {
        key = `${rawName} ${rawVer}`.trim() || 'Linux';
      }
    }
    osMap.set(key, (osMap.get(key) || 0) + 1);
  });

  const osDistribution = Array.from(osMap.entries()).map(([name, count], index) => ({
    name,
    count,
    color: OS_PALETTE[index % OS_PALETTE.length],
  }));

  const totalOsCount = osDistribution.reduce((acc, curr) => acc + curr.count, 0);

  // Filtered agents (Live data only, no mock fallback)
  const filteredAgents = agents.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    const osString = typeof a.os === 'string' ? a.os : `${a.os?.name || ''} ${a.os?.version || ''}`;
    const tenantCode = a.assignedTenant?.tenantCode?.toLowerCase() || '';
    const campusName = a.assignedTenant?.campusName?.toLowerCase() || '';

    const matchSearch =
      !q ||
      a.id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      (a.ip && a.ip.toLowerCase().includes(q)) ||
      osString.toLowerCase().includes(q) ||
      tenantCode.includes(q) ||
      campusName.includes(q);

    const matchTenant =
      selectedTenantFilter === 'all' ||
      tenantCode === selectedTenantFilter.toLowerCase();

    return matchSearch && matchTenant;
  });

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
            Agent Status
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Wazuh security agent inventory, connection health, and OS distributions.
          </p>
        </div>

        <button
          onClick={() => fetchAgents(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* ROW 1: Agent Breakdown (Left) & OS Distribution (Right)   */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Agent Progress Bars (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Agent</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center my-auto py-4">
            {/* 4 Stacked Progress Bars (8 cols) */}
            <div className="sm:col-span-8 space-y-4">
              {/* Online Bar */}
              <div className="w-full bg-[#D1FAE5] h-5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-[#10B981] h-full rounded-full transition-all duration-700"
                  style={{ width: `${totalAgents > 0 ? (onlineAgents / totalAgents) * 100 : 0}%` }}
                />
              </div>

              {/* Offline Bar */}
              <div className="w-full bg-[#FEE2E2] h-5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-[#EF4444] h-full rounded-full transition-all duration-700"
                  style={{ width: `${totalAgents > 0 && offlineAgents > 0 ? Math.max(6, (offlineAgents / totalAgents) * 100) : 0}%` }}
                />
              </div>

              {/* Registered Bar */}
              <div className="w-full bg-[#DBEAFE] h-5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-[#0066FF] h-full rounded-full transition-all duration-700"
                  style={{ width: `${totalAgents > 0 ? (registeredAgents / totalAgents) * 100 : 0}%` }}
                />
              </div>

              {/* Not Registered Bar */}
              <div className="w-full bg-[#EDE9FE] h-5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-[#8B5CF6] h-full rounded-full transition-all duration-700"
                  style={{ width: `${totalAgents > 0 && notRegisteredAgents > 0 ? Math.max(6, (notRegisteredAgents / totalAgents) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Numbers on right (4 cols) */}
            <div className="sm:col-span-4 space-y-2 text-xs md:text-sm">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-800 text-sm">Total Agents</span>
                <span className="font-extrabold text-slate-800 text-base font-mono">
                  {totalAgents}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#10B981]">Online</span>
                <span className="font-bold text-[#10B981] font-mono">{onlineAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#EF4444]">Offline</span>
                <span className="font-bold text-[#EF4444] font-mono">{offlineAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0066FF]">Registered</span>
                <span className="font-bold text-[#0066FF] font-mono">{registeredAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#8B5CF6]">Not Registered</span>
                <span className="font-bold text-[#8B5CF6] font-mono">{notRegisteredAgents}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Operating System Distribution (5 cols) matching Gambar 1 with real data & dynamic colors */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Operating System Distribution</h3>
          </div>

          <div className="flex items-center justify-between gap-4 py-4 my-auto">
            {/* Donut Chart Ring with accurate dynamic colored segments */}
            <div className="relative w-32 h-32 md:w-36 md:h-36 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {/* Background track */}
                <circle cx="50" cy="50" r="38" stroke="#F1F5F9" strokeWidth="12" fill="none" />
                {totalOsCount > 0 && (() => {
                  let accumulated = 0;
                  const C = 238.761;
                  return osDistribution.map((os) => {
                    const sliceLen = (os.count / totalOsCount) * C;
                    const strokeDasharray = `${sliceLen} ${C - sliceLen}`;
                    const strokeDashoffset = -accumulated;
                    accumulated += sliceLen;
                    return (
                      <circle
                        key={os.name}
                        cx="50"
                        cy="50"
                        r="38"
                        stroke={os.color}
                        strokeWidth="12"
                        fill="none"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-700 ease-out"
                      />
                    );
                  });
                })()}
              </svg>
            </div>

            {/* Legend list matching colors */}
            <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
              {osDistribution.length === 0 ? (
                <span className="text-slate-400 text-xs">{loading ? 'Memuat OS...' : 'Tidak ada data OS'}</span>
              ) : (
                osDistribution.map((os) => (
                  <div key={os.name} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: os.color }}
                    />
                    <span
                      className="font-semibold"
                      style={{ color: os.color }}
                    >
                      {os.name} ({os.count})
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 2: Filter & Search Bar in Container (Mentok & No Gap) */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        {/* Search Input stretched to fill all space */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search agent ID, name, IP, OS, or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-8 py-2.5 bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-slate-300 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Select Tenants Dropdown Pill */}
        <div className="w-full sm:w-auto flex-shrink-0">
          <CustomSelect
            value={selectedTenantFilter}
            onChange={(val) => setSelectedTenantFilter(String(val))}
            options={[
              { value: 'all', label: 'All Tenants', badge: 'ALL' },
              ...tenants.map((t) => ({
                value: t.tenantCode,
                label: (t.tenantName || t.campusName) ? `${t.tenantName || t.campusName} (${t.tenantCode})` : t.tenantCode,
                badge: t.tenantCode,
              })),
            ]}
            placeholder="Select Tenants"
            className="w-full sm:w-56"
            buttonClassName="w-full sm:w-56"
          />
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 3: Agent Table Card matching Figma                    */}
      {/* ========================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Agent Table</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
              {filteredAgents.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider">
                <th className="py-3 px-4 rounded-l-xl">Agent ID</th>
                <th className="py-3 px-4">Agent Name</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Operating System</th>
                <th className="py-3 px-4">Tenant</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 rounded-r-xl">Last Keep Alive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2 text-blue-600" />
                    Loading agents list...
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                    No agents match search criteria.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent, idx) => (
                  <tr
                    key={`${agent.id}-${idx}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {agent.id}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                      {agent.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {agent.ip || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 text-xs">
                      {typeof agent.os === 'string'
                        ? agent.os
                        : `${agent.os?.name || ''} ${agent.os?.version || ''}`.trim() || 'Linux'}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 text-xs">
                      {agent.assignedTenant?.tenantCode || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          agent.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {agent.status === 'active' ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900 text-xs">
                      {agent.lastKeepAlive && agent.lastKeepAlive !== '-'
                        ? (() => {
                            try {
                              const d = new Date(agent.lastKeepAlive);
                              if (isNaN(d.getTime())) return agent.lastKeepAlive;
                              const pad = (n: number) => String(n).padStart(2, '0');
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
                            } catch {
                              return agent.lastKeepAlive;
                            }
                          })()
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
