'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { FigmaDatabaseCard, DatabaseNodeInfo } from '@/components/database/FigmaDatabaseCard';
import { DonutGauge } from '@/components/ui/DonutGauge';

export default function DatabaseStatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataCountTab, setDataCountTab] = useState<'MongoDB' | 'Redis'>('MongoDB');

  const fetchDatabaseStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Error fetching database status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDatabaseStatus(false);
    const interval = setInterval(() => {
      fetchDatabaseStatus(false);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const todayDateStr = data?.todayDataCount?.date || new Date().toISOString().slice(0, 10);
  const mongoTotals = data?.todayDataCount?.mongo || { incidents: 0, vulns: 0, reports: 0 };
  const redisTotals = data?.todayDataCount?.redis || { incidents: 0, vulns: 0, reports: 0 };

  // Core 3 Databases: MySQL, MongoDB, Redis
  const mysqlNode = data?.nodes?.find((n: any) => n.id === 'mysql');
  const mongoNode = data?.nodes?.find((n: any) => n.id === 'mongodb');
  const redisNode = data?.nodes?.find((n: any) => n.id === 'redis');

  const coreDbs = [
    { id: 'mysql', name: 'MYSQL', ok: mysqlNode?.ok ?? true },
    { id: 'mongodb', name: 'MongoDB', ok: mongoNode?.ok ?? true },
    { id: 'redis', name: 'Redis', ok: redisNode?.ok ?? false },
  ];

  // Combined percentage of all 3 databases (if any is down, percentage drops)
  const onlineCoreDbsCount = coreDbs.filter((d) => d.ok).length;
  const activeDatabasePercent = Math.round((onlineCoreDbsCount / coreDbs.length) * 100);

  const figmaCards: DatabaseNodeInfo[] = [
    {
      id: 'mysql',
      name: 'MYSQL',
      port: 3306,
      role: 'User & Tenant Mapping',
      ok: data?.nodes?.find((n: any) => n.id === 'mysql')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'mysql')?.latencyMs,
      uptime: data?.nodes?.find((n: any) => n.id === 'mysql')?.uptime || 'Online',
      startedAt: data?.nodes?.find((n: any) => n.id === 'mysql')?.startedAt || '-',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'mysql')?.lastSeen || (data?.nodes?.find((n: any) => n.id === 'mysql')?.ok ? 'Online' : 'Disconnected'),
      logoSrc: '/mysql.png',
    },
    {
      id: 'mongodb',
      name: 'MongoDB',
      port: 27017,
      role: 'Transactional & Aggregate Database',
      ok: data?.nodes?.find((n: any) => n.id === 'mongodb')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'mongodb')?.latencyMs,
      uptime: data?.nodes?.find((n: any) => n.id === 'mongodb')?.uptime || 'Online',
      startedAt: data?.nodes?.find((n: any) => n.id === 'mongodb')?.startedAt || '-',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'mongodb')?.lastSeen || (data?.nodes?.find((n: any) => n.id === 'mongodb')?.ok ? 'Online' : 'Disconnected'),
      logoSrc: '/mongodb.png',
    },
    {
      id: 'redis',
      name: 'Redis',
      port: 6379,
      role: 'Frequent Access Data Cache',
      ok: data?.nodes?.find((n: any) => n.id === 'redis')?.ok ?? false,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'redis')?.latencyMs,
      uptime: data?.nodes?.find((n: any) => n.id === 'redis')?.uptime || 'Online',
      startedAt: data?.nodes?.find((n: any) => n.id === 'redis')?.startedAt || '-',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'redis')?.lastSeen || (data?.nodes?.find((n: any) => n.id === 'redis')?.ok ? 'Online' : 'Disconnected'),
      logoSrc: '/redis.png',
    },
  ];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-200">
      {/* Top Title & Action */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Database Status
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Health metrics, storage stats, and operational state across all ASOC data engines.
          </p>
        </div>

        <button
          onClick={() => fetchDatabaseStatus(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200/80 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* ROW 1: Data Count Card (Left) & Active Database (Right)   */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Data Count Card (8 cols) matching Gambar 4 */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Data Count (Today)</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Across all tenant databases &bull; {todayDateStr}
                </p>
              </div>
              <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-lg">
                Today Telemetry
              </span>
            </div>

            {/* MongoDB / Redis Legend matching Gambar 4 */}
            <div className="flex items-center gap-4 mt-3 text-xs font-bold tracking-wider">
              <span className="text-emerald-500 font-extrabold cursor-default">
                MongoDB
              </span>
              <span className="text-rose-500 font-extrabold cursor-default">
                Redis
              </span>
            </div>
          </div>

          {/* 2 Rows matching Gambar 4 */}
          <div className="space-y-4 mt-4">
            {/* Row 1 (MongoDB): Pastel Green Box on left, Stats on right */}
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Pastel Green Box */}
              <div className="w-full sm:w-[52%] h-24 bg-[#E8F8F0] rounded-2xl flex-shrink-0" />
              {/* Stats on right */}
              <div className="w-full sm:w-[48%] space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Incidents</span>
                  <span className="font-extrabold text-slate-800 font-mono text-base">
                    {loading ? '...' : mongoTotals.incidents.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Vulnerability</span>
                  <span className="font-extrabold text-slate-800 font-mono text-base">
                    {loading ? '...' : mongoTotals.vulns.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Reports</span>
                  <span className="font-extrabold text-slate-800 font-mono text-base">
                    {loading ? '...' : mongoTotals.reports.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2 (Redis): Pastel Pink Box on left, Stats on right */}
            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* Pastel Pink Box */}
              <div className="w-full sm:w-[52%] h-24 bg-[#FDEBEB] rounded-2xl flex-shrink-0" />
              {/* Stats on right */}
              <div className="w-full sm:w-[48%] space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Incidents</span>
                  <span className="font-extrabold text-slate-900 font-mono text-base">
                    {loading ? '...' : redisTotals.incidents.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Vulnerability</span>
                  <span className="font-extrabold text-slate-900 font-mono text-base">
                    {loading ? '...' : redisTotals.vulns.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Reports</span>
                  <span className="font-extrabold text-slate-800 font-mono text-base">
                    {loading ? '...' : redisTotals.reports.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Active Database Gauge Card (4 cols) matching Gambar 5 */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">Active Database</h3>
            </div>

            {/* 3 Core Databases Status Indicators (Not tabs) matching Gambar 5 */}
            <div className="flex items-center gap-4 mt-3 text-xs font-bold tracking-wider">
              {coreDbs.map((db) => (
                <span
                  key={db.id}
                  className={`transition-colors flex items-center gap-1.5 ${
                    db.ok
                      ? 'text-[#0066FF] font-extrabold'
                      : 'text-slate-400 font-medium'
                  }`}
                  title={db.ok ? `${db.name} Online` : `${db.name} Offline`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      db.ok ? 'bg-[#0066FF]' : 'bg-slate-300'
                    }`}
                  />
                  {db.name}
                </span>
              ))}
            </div>
          </div>

          {/* Donut Ring indicating combined health of all 3 databases */}
          <div className="py-6 flex items-center justify-center">
            <DonutGauge
              percentage={activeDatabasePercent}
              size={165}
              strokeWidth={15}
              color="#0066FF"
              trackColor="#F0F4F8"
            />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ROW 2 & 3: 6 Database Service Cards Grid (3 cols x 2 rows)*/}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {figmaCards.map((card) => (
          <FigmaDatabaseCard key={card.id} node={card} />
        ))}
      </div>
    </div>
  );
}
