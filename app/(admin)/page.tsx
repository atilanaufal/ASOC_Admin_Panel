'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building2,
} from 'lucide-react';
import { DonutGauge } from '@/components/ui/DonutGauge';

interface OverviewResponse {
  success: boolean;
  timestamp: string;
  summary?: {
    databases: { total: number; online: number; offline: number; healthPercent: number };
    agents: { total: number; online: number; offline: number; healthPercent: number };
    services: { total: number; online: number; offline: number; healthPercent: number };
    resources: { cpuPercent: number; memPercent: number; diskPercent: number; avgUtilization: number };
    sync?: { isMismatch: boolean; statusText: string };
    agentGrouping?: {
      total: number;
      groupedCount: number;
      ungroupedCount: number;
      allGrouped: boolean;
      statusText: string;
    };
    irisMapping?: {
      totalTenants: number;
      mappedCount: number;
      unmappedCount: number;
      allMapped: boolean;
      statusText: string;
    };
  };
  metrics?: {
    tenantCount?: number;
    userCount?: number;
    tenants?: Array<{ id: number; tenant_code: string; tenant_name?: string; campus_name?: string; userCount?: number }>;
  };
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resourceTab, setResourceTab] = useState<'RAM' | 'CPU' | 'DISK'>('RAM');

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
    const interval = setInterval(() => fetchOverview(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const summary = data?.summary || {
    databases: { total: 5, online: 4, offline: 1, healthPercent: 80 },
    agents: { total: 20, online: 19, offline: 1, healthPercent: 95 },
    services: { total: 7, online: 5, offline: 2, healthPercent: 71 },
    resources: { cpuPercent: 28, memPercent: 32, diskPercent: 15, avgUtilization: 25 },
    sync: { isMismatch: false, statusText: 'Synchronized' },
    agentGrouping: {
      total: 20,
      groupedCount: 19,
      ungroupedCount: 1,
      allGrouped: false,
      statusText: '1 Ungrouped',
    },
    irisMapping: {
      totalTenants: 5,
      mappedCount: 4,
      unmappedCount: 1,
      allMapped: false,
      statusText: '1 Unmapped',
    },
  };

  const rawTenants = data?.metrics?.tenants || [];
  const tenantUsers =
    rawTenants.length > 0
      ? rawTenants.map((t) => {
          const tName = t.tenant_name || t.campus_name || '';
          return {
            name: tName ? `${tName.toUpperCase()} (${t.tenant_code})` : t.tenant_code,
            users: t.userCount ?? 1,
          };
        })
      : [
          { name: 'TENANT A (TNTA)', users: 1 },
          { name: 'TENANT B (TNTB)', users: 1 },
          { name: 'TENANT C (TNTC)', users: 1 },
          { name: 'TENANT D (TNTD)', users: 1 },
          { name: 'TES1 (TES1)', users: 1 },
        ];

  const currentResourcePercent =
    resourceTab === 'RAM'
      ? Math.round(summary.resources.memPercent)
      : resourceTab === 'CPU'
      ? Math.round(summary.resources.cpuPercent)
      : Math.round(summary.resources.diskPercent);

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-200">
      {/* Top Bar with Refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
            Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time infrastructure telemetry, tenant metrics, and synchronization health.
          </p>
        </div>

        <button
          onClick={() => fetchOverview(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* ROW 1: 3 KPI Summary Cards with Donut Gauges (Figma)      */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Database */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Database</h3>
            <div className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              {summary.databases.total} Total
            </div>
            <div className="text-xs font-bold text-emerald-600 tracking-wide uppercase">
              {summary.databases.online} / {summary.databases.total} ONLINE
            </div>
          </div>
          <DonutGauge
            percentage={summary.databases.healthPercent || 80}
            size={96}
            strokeWidth={9}
            color="#0066FF"
          />
        </div>

        {/* Card 2: Wazuh Agents */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Wazuh Agents</h3>
            <div className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              {summary.agents.total} Total
            </div>
            <div className="text-xs font-bold text-emerald-600 tracking-wide uppercase">
              {summary.agents.online} / {summary.agents.total} ONLINE
            </div>
          </div>
          <DonutGauge
            percentage={summary.agents.healthPercent || 75}
            size={96}
            strokeWidth={9}
            color="#0066FF"
          />
        </div>

        {/* Card 3: Running Services */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">Running Services</h3>
            <div className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight">
              {summary.services.total} Total
            </div>
            <div className="text-xs font-bold text-emerald-600 tracking-wide uppercase">
              {summary.services.online} / {summary.services.total} ONLINE
            </div>
          </div>
          <DonutGauge
            percentage={summary.services.healthPercent || 100}
            size={96}
            strokeWidth={9}
            color="#0066FF"
          />
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 2: Total Users (Left) & Resources Usage (Right)        */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Total Users List Card (Left - 8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">Total Users</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                {tenantUsers.reduce((sum, u) => sum + (u.users || 0), 0)}
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {tenantUsers.map((item) => (
              <div
                key={item.name}
                className="py-3 flex items-center justify-between text-xs md:text-sm hover:bg-slate-50/50 px-2 rounded-lg transition-colors"
              >
                <span className="font-medium text-slate-700">{item.name}</span>
                <span className="font-semibold text-slate-400 font-mono">
                  {item.users} Users
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Resources Usage Donut Card (Right - 4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Resources Usage</h3>
              <Link
                href="/resource-usage"
                className="text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                title="View Resource Details"
              >
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* RAM / CPU / DISK Tabs */}
            <div className="flex items-center gap-4 mt-4 text-xs font-bold tracking-wider">
              <button
                onClick={() => setResourceTab('RAM')}
                className={`transition-colors cursor-pointer ${
                  resourceTab === 'RAM'
                    ? 'text-emerald-500 font-extrabold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                RAM
              </button>
              <button
                onClick={() => setResourceTab('CPU')}
                className={`transition-colors cursor-pointer ${
                  resourceTab === 'CPU'
                    ? 'text-emerald-500 font-extrabold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                CPU
              </button>
              <button
                onClick={() => setResourceTab('DISK')}
                className={`transition-colors cursor-pointer ${
                  resourceTab === 'DISK'
                    ? 'text-emerald-500 font-extrabold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                DISK
              </button>
            </div>
          </div>

          {/* Large Donut Ring Centered */}
          <div className="py-6 flex items-center justify-center">
            <DonutGauge
              percentage={currentResourcePercent}
              size={160}
              strokeWidth={14}
              color="#0066FF"
            />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 3: 3 Infrastructure Status Widgets Side-by-Side       */}
      {/* Data Synchronization | Agent Grouping | IRIS Mapping      */}
      {/* (Clean stat card style matching Gambar 3, no donut gauge) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Widget 1: Data Synchronization (Mismatch / Synchronized only) */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Data Synchronization
              </h3>
              <Link
                href="/data-sync"
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="View Data Synchronization"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">
              {summary.sync?.isMismatch ? 'Mismatch' : 'Synchronized'}
            </div>
            <div
              className={`text-xs font-bold tracking-wide uppercase ${
                summary.sync?.isMismatch ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {summary.sync?.isMismatch ? 'PARITY MISMATCH DETECTED' : '100% SYNCHRONIZED'}
            </div>
          </div>
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-xs ${
              summary.sync?.isMismatch
                ? 'bg-rose-50 text-rose-500'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {summary.sync?.isMismatch ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
          </div>
        </div>

        {/* Widget 2: Agent Grouping */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Agent Grouping
              </h3>
              <Link
                href="/wazuh-group"
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="View Agent Grouping"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">
              {summary.agentGrouping?.allGrouped
                ? 'All Grouped'
                : `${summary.agentGrouping?.ungroupedCount ?? 0} Ungrouped`}
            </div>
            <div className="text-xs font-bold text-slate-500 tracking-wide uppercase">
              {summary.agentGrouping?.groupedCount ?? 0} / {summary.agentGrouping?.total ?? 0} GROUPED
            </div>
          </div>
          <div className="w-12 h-12 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center flex-shrink-0 shadow-xs">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Widget 3: IRIS Mapping to Tenant */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                IRIS Mapping
              </h3>
              <Link
                href="/iris-customer"
                className="text-slate-400 hover:text-blue-600 transition-colors"
                title="View IRIS Customer Mapping"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="text-2xl font-bold text-slate-800 tracking-tight">
              {summary.irisMapping?.allMapped
                ? 'All Mapped'
                : `${summary.irisMapping?.unmappedCount ?? 0} Unmapped`}
            </div>
            <div className="text-xs font-bold text-slate-500 tracking-wide uppercase">
              {summary.irisMapping?.mappedCount ?? 0} / {summary.irisMapping?.totalTenants ?? 0} MAPPED
            </div>
          </div>
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0 shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>
    </div>
  );
}
