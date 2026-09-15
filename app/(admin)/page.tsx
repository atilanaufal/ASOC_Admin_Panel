'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Power,
  Cpu,
  Layers,
  HardDrive,
  ArrowRight,
  RefreshCw,
  Building2,
} from 'lucide-react';

interface OverviewSummary {
  databases: {
    total: number;
    online: number;
    offline: number;
    healthPercent: number;
  };
  agents: {
    total: number;
    online: number;
    offline: number;
    healthPercent: number;
  };
  services: {
    total: number;
    online: number;
    offline: number;
    healthPercent: number;
  };
  latency: {
    queryLatency: number;
    writeLatency: number;
    history: Array<{ time: string; query: number; write: number }>;
  };
  resources: {
    cpuPercent: number;
    memPercent: number;
    diskPercent: number;
    avgUtilization: number;
  };
  sync: {
    isMismatch: boolean;
    statusText: string;
  };
  agentGrouping: {
    allGrouped: boolean;
    unassignedCount: number;
    statusText: string;
  };
}

interface OverviewResponse {
  success: boolean;
  timestamp: string;
  summary?: OverviewSummary;
  health?: any;
  metrics?: any;
}

// Compact Vector Circular Progress Ring
function CircularProgress({
  percent,
  className = 'w-16 h-16',
  color = '#4287FF',
  trackColor = '#E2E8F0',
  label,
}: {
  percent: number;
  className?: string;
  color?: string;
  trackColor?: string;
  label?: string;
}) {
  const size = 80;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        {/* Track */}
        <circle
          cx={40}
          cy={40}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Fill */}
        <circle
          cx={40}
          cy={40}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-xs lg:text-sm font-extrabold text-slate-800 tracking-tight">
        {label || `${Math.round(percent)}%`}
      </span>
    </div>
  );
}



export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/overview');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(() => fetchOverview(false), 25000);
    return () => clearInterval(interval);
  }, []);

  const summary = data?.summary || {
    databases: { total: 5, online: 2, offline: 3, healthPercent: 40 },
    agents: { total: 50, online: 47, offline: 3, healthPercent: 90 },
    services: { total: 8, online: 8, offline: 0, healthPercent: 100 },
    latency: {
      queryLatency: 23.7,
      writeLatency: 10.5,
      history: [],
    },
    resources: {
      cpuPercent: 23,
      memPercent: 100,
      diskPercent: 100,
      avgUtilization: 63.5,
    },
    sync: { isMismatch: true, statusText: 'Mismatch Detected' },
    agentGrouping: { allGrouped: true, unassignedCount: 0, statusText: 'All Agents Grouped' },
  };

  return (
    <div className="space-y-4 md:space-y-5 pb-6 animate-in fade-in duration-200">
      {/* Page Heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold text-[#2F2F2F] tracking-tight">
          System Status Check
        </h1>

        <button
          onClick={() => fetchOverview(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* ROW 1: Quick Count Grid (3 Clean White Cards)             */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Databases */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-slate-700">Databases</h3>
            <Link
              href="/database-status"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
            >
              <span>View Database</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="space-y-1">
              <div className="text-2xl lg:text-3xl font-extrabold text-[#2F2F2F] tracking-tight">
                {summary.databases.total} Total
              </div>
              <div className="flex items-center gap-1.5 text-[#00A502] font-semibold text-xs">
                <Power className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {summary.databases.total} / {summary.databases.online} Online
                </span>
              </div>
            </div>

            <CircularProgress
              percent={summary.databases.healthPercent}
              className="w-16 h-16"
              color="#4287FF"
            />
          </div>
        </div>

        {/* Card 2: Wazuh Agents (with left blue accent border) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 border-l-4 border-l-[#0037B0] p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-slate-700">Wazuh Agents</h3>
            <Link
              href="/agent-mapping"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
            >
              <span>Manage Agents</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="space-y-1">
              <div className="text-2xl lg:text-3xl font-extrabold text-[#2F2F2F] tracking-tight">
                {summary.agents.total} Total
              </div>
              <div className="flex items-center gap-1.5 text-[#00A502] font-semibold text-xs">
                <Power className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {summary.agents.total} / {summary.agents.online} Online
                </span>
              </div>
            </div>

            <CircularProgress
              percent={summary.agents.healthPercent}
              className="w-16 h-16"
              color="#4287FF"
            />
          </div>
        </div>

        {/* Card 3: Running Services */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-slate-700">Running Services</h3>
            <Link
              href="/service-monitor"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
            >
              <span>Service Details</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="space-y-1">
              <div className="text-2xl lg:text-3xl font-extrabold text-[#2F2F2F] tracking-tight">
                {summary.services.total} Total
              </div>
              <div className="flex items-center gap-1.5 text-[#00A502] font-semibold text-xs">
                <Power className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>
                  {summary.services.total} / {summary.services.online} Online
                </span>
              </div>
            </div>

            <CircularProgress
              percent={summary.services.healthPercent}
              className="w-16 h-16"
              color="#4287FF"
            />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 2: Latency & Compact Resources Usage (No Gaps)        */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Multi-Tenant Campus Registry (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-4 lg:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-800">Multi-Tenant Campus Registry</h3>
              </div>
              <Link
                href="/tenants"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
              >
                <span>Manage Tenants</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Quick Metrics Pills */}
            <div className="grid grid-cols-3 gap-2.5 mb-3.5">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Campuses</p>
                <p className="text-lg font-extrabold text-slate-900 font-mono mt-0.5">
                  {data?.metrics?.tenantCount ?? 4}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Databases</p>
                <p className="text-lg font-extrabold text-blue-600 font-mono mt-0.5">
                  {data?.metrics?.mongoDatabaseCount ?? 8}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Users</p>
                <p className="text-lg font-extrabold text-emerald-600 font-mono mt-0.5">
                  {data?.metrics?.userCount ?? 4}
                </p>
              </div>
            </div>

            {/* Tenant Fleet List */}
            <div className="space-y-2">
              {((data?.metrics?.tenants && data.metrics.tenants.length > 0)
                ? data.metrics.tenants.slice(0, 4)
                : [
                    { id: 1, tenant_code: 'TNTA', campus_name: 'Tenant A', database_name: 'tenant_a', redis_prefix: 'tenant_a:' },
                    { id: 2, tenant_code: 'TNTB', campus_name: 'Tenant B', database_name: 'tenant_b', redis_prefix: 'tenant_b:' },
                    { id: 3, tenant_code: 'TNTC', campus_name: 'Tenant C', database_name: 'tenant_c', redis_prefix: 'tenant_c:' },
                    { id: 4, tenant_code: 'TNTD', campus_name: 'Tenant D', database_name: 'tenant_d', redis_prefix: 'tenant_d:' },
                  ]
              ).map((tenant: any) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-extrabold text-[11px] font-mono flex-shrink-0">
                      {tenant.tenant_code}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate uppercase">
                        {tenant.campus_name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        DB: {tenant.database_name} • Redis: {tenant.redis_prefix || `${tenant.database_name}:`}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Resources Usage (5 Cols) - Fully Expanded to Fill Height */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-700">Resources Usage</h3>
              <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                Average System Utilization
              </p>
            </div>
            <div className="text-xl lg:text-2xl font-extrabold text-[#2F2F2F] font-mono tracking-tight">
              {summary.resources.avgUtilization.toFixed(1)} %
            </div>
          </div>

          {/* 3 Large Circular Gauges expanding to fill entire card height */}
          <div className="grid grid-cols-3 gap-3 pt-3 flex-1">
            {/* CPU Gauge Card */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors h-full">
              <div className="flex items-center gap-1.5 mb-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-700">CPU</span>
              </div>
              <CircularProgress
                percent={summary.resources.cpuPercent}
                className="w-18 h-18 lg:w-20 lg:h-20"
                color="#4287FF"
              />
            </div>

            {/* Memory Gauge Card */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors h-full">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700">Memory</span>
              </div>
              <CircularProgress
                percent={summary.resources.memPercent}
                className="w-18 h-18 lg:w-20 lg:h-20"
                color="#4287FF"
              />
            </div>

            {/* Disk Gauge Card */}
            <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors h-full">
              <div className="flex items-center gap-1.5 mb-2">
                <HardDrive className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-700">Disk</span>
              </div>
              <CircularProgress
                percent={summary.resources.diskPercent}
                className="w-18 h-18 lg:w-20 lg:h-20"
                color="#4287FF"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 3: Data Synchronization & Agent Grouping (100% English)*/}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Data Synchronization */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-slate-700">Data Synchronization</h3>
            <Link
              href="/data-sync"
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1"
            >
              <span>Sync Pipeline</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="pt-1">
            <span
              className={`text-xl lg:text-2xl font-extrabold tracking-tight ${
                summary.sync.isMismatch ? 'text-[#C70000]' : 'text-[#00A502]'
              }`}
            >
              {summary.sync.statusText}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              {summary.sync.isMismatch
                ? 'Data discrepancies detected across engine nodes'
                : 'All database pipelines verified and in sync'}
            </p>
          </div>
        </div>

        {/* Agent Grouping */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm text-slate-700">Agent Grouping</h3>
            <Link
              href="/agent-mapping"
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1"
            >
              <span>Map Agents</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="pt-1">
            <span
              className={`text-xl lg:text-2xl font-extrabold tracking-tight ${
                summary.agentGrouping.allGrouped ? 'text-[#00A502]' : 'text-[#C70000]'
              }`}
            >
              {summary.agentGrouping.statusText}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              {summary.agentGrouping.allGrouped
                ? 'All Wazuh agents mapped to tenant group clusters'
                : `${summary.agentGrouping.unassignedCount} agents pending group assignment`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}





