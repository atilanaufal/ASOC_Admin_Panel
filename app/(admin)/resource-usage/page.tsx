'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  HardDrive,
  Database,
  Server,
  RefreshCw,
  Layers,
  Activity,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';

export default function ResourceUsagePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchResources = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/resource-usage');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching resource usage:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResources();
    const interval = setInterval(() => fetchResources(false), 20000);
    return () => clearInterval(interval);
  }, []);

  const vm = data?.vmOverall;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              VM & Architecture Resource Usage
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time monitoring of CPU, RAM, and Disk utilization on VM{' '}
              <span className="font-mono font-bold text-slate-700">{data?.vmHost || '10.20.100.86'}</span> and
              individual service workloads.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchResources(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50 self-start md:self-auto cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* VM Overall Gauges (Host 10.20.100.86) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* CPU Load */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-600" />
              <span>VM CPU Load</span>
            </span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">
              {data?.vmHost || '10.20.100.86'}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-slate-900">
              {loading ? '...' : `${vm?.cpuUsagePercent ?? 0}%`}
            </span>
            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Normal Load
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, vm?.cpuUsagePercent || 10))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Computed from active MySQL QPS and Redis L1 cache ops.
          </p>
        </div>

        {/* RAM Usage */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-indigo-600" />
              <span>RAM Usage</span>
            </span>
            <span className="text-xs font-bold text-slate-500">
              {loading ? '...' : `${vm?.ramUsedFormatted ?? '0 B'} / ${vm?.ramTotalFormatted ?? '4 GB'}`}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-slate-900">
              {loading ? '...' : `${vm?.ramUsagePercent ?? 0}%`}
            </span>
            <span className="text-xs text-indigo-600 font-bold">
              Architecture Allocation
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-indigo-500 to-violet-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, vm?.ramUsagePercent || 25))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Includes Mongo Resident Memory, MySQL InnoDB Buffer, and Redis RSS.
          </p>
        </div>

        {/* Disk Usage */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              <span>Disk Storage</span>
            </span>
            <span className="text-xs font-bold text-slate-500">
              {loading ? '...' : `${vm?.diskUsedFormatted ?? '0 B'} / ${vm?.diskTotalFormatted ?? '60 GB'}`}
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-slate-900">
              {loading ? '...' : `${vm?.diskUsagePercent ?? 0}%`}
            </span>
            <span className="text-xs text-emerald-600 font-bold">
              Capacity In Use
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(5, vm?.diskUsagePercent || 15))}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Total disk of multi-tenant MongoDB, MySQL auth_db, and system baseline.
          </p>
        </div>
      </div>

      {/* Individual Architecture Service Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Architecture Services Breakdown</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            3 Core Storage & Caching Engines on VM {data?.vmHost || '10.20.100.86'}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-56 bg-white rounded-2xl border border-slate-200 p-5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {data?.components?.map((c: any) => {
              const isOnline = c.status === 'ONLINE';

              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all space-y-4"
                >
                  <div>
                    {/* Top Row: Name & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">{c.name}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">{c.role}</p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isOnline
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-rose-50 text-rose-700 border border-rose-200/80'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-2 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200/60 rounded-lg px-2.5 py-1 inline-block">
                      {c.host}
                    </div>

                    {/* RAM, Disk, CPU row */}
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                      <div className="bg-slate-50/80 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">RAM Used</span>
                        <span className="text-xs font-black text-slate-800 font-mono mt-0.5 block">
                          {c.ramUsedFormatted}
                        </span>
                      </div>
                      <div className="bg-slate-50/80 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Storage</span>
                        <span className="text-xs font-black text-slate-800 font-mono mt-0.5 block">
                          {c.diskUsedFormatted}
                        </span>
                      </div>
                      <div className="bg-slate-50/80 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Throughput</span>
                        <span className="text-xs font-black text-slate-800 font-mono mt-0.5 block">
                          {c.cpuIndicator}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics bullet list */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                    {c.metrics?.map((m: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">{m.label}</span>
                        <span className="font-mono font-bold text-slate-700">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
