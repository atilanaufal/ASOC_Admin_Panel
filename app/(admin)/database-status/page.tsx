'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { QuickStartStopBar } from '@/components/database/QuickStartStopBar';
import { FigmaDatabaseCard, DatabaseNodeInfo } from '@/components/database/FigmaDatabaseCard';

export default function DatabaseStatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkToast, setCheckToast] = useState<string | null>(null);

  const fetchDatabaseStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (isManual) {
          setCheckToast('Database status updated successfully');
          setTimeout(() => setCheckToast(null), 4000);
        }
      }
    } catch (err) {
      console.error('Error fetching database status:', err);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDatabaseStatus(false);
    const interval = setInterval(() => {
      fetchDatabaseStatus(false);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Map 6 cards exactly matching the Figma layout and specs
  const figmaCards: DatabaseNodeInfo[] = [
    {
      id: 'mysql',
      name: 'MySQL',
      port: 3306,
      role: 'Master Auth & Mapping SSOT',
      ok: data?.nodes?.find((n: any) => n.id === 'mysql')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'mysql')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'mysql')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/mysql.png',
    },
    {
      id: 'mongodb',
      name: 'MongoDB',
      port: 27017,
      role: 'Transactional & Aggregate Data Storage',
      ok: data?.nodes?.find((n: any) => n.id === 'mongodb')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'mongodb')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'mongodb')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/mongodb.png',
    },
    {
      id: 'redis',
      name: 'Redis',
      port: 6379,
      role: 'Frequent Access Data Cache',
      ok: data?.nodes?.find((n: any) => n.id === 'redis')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'redis')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'redis')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/redis.png',
    },
    {
      id: 'opensearch',
      name: 'Wazuh Indexer',
      port: 9200,
      role: 'Raw Alert & Vulnerability Logs',
      ok: data?.nodes?.find((n: any) => n.id === 'opensearch')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'opensearch')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'opensearch')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/indexer.png',
    },
    {
      id: 'iris',
      name: 'DFIR-IRIS Postgre',
      port: 8443,
      role: 'Case Management Platform',
      ok: data?.nodes?.find((n: any) => n.id === 'iris')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'iris')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'iris')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/postgre.png',
    },
    {
      id: 'wazuh',
      name: 'Wazuh Manager',
      port: 55000,
      role: 'Security Agent Telemetry',
      ok: data?.nodes?.find((n: any) => n.id === 'wazuh')?.ok ?? true,
      latencyMs: data?.nodes?.find((n: any) => n.id === 'wazuh')?.latencyMs,
      uptime: '30D 2H 20M',
      startedAt: '03 March 2026 | 22:00',
      lastSeen: data?.nodes?.find((n: any) => n.id === 'wazuh')?.ok ? '10 Seconds Ago' : 'Disconnected',
      logoSrc: '/infoguard.png',
    },
  ];

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {checkToast && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-sm flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="font-semibold">{checkToast}</span>
        </div>
      )}

      {/* 1. Top Quick Start/Stop Bar matching Figma */}
      <QuickStartStopBar
        nodes={data?.nodes || []}
      />

      {/* 2. 6 Database Cards Grid (3 Columns x 2 Rows) matching Figma */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-72 bg-white rounded-xl border border-gray-200/80 p-6 animate-pulse flex flex-col justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-slate-200" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                </div>
              </div>
              <div className="h-10 bg-slate-100 rounded-md" />
              <div className="space-y-2 border-t pt-3">
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 bg-slate-100 rounded" />
                <div className="h-4 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {figmaCards.map((card) => (
            <FigmaDatabaseCard key={card.id} node={card} />
          ))}
        </div>
      )}
    </div>
  );
}
