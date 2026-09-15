'use client';

import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ServiceStatusGrid } from '@/components/services/ServiceStatusGrid';
import { DaemonExecutionCard } from '@/components/services/DaemonExecutionCard';
import { DaemonDetailModal } from '@/components/services/DaemonDetailModal';
import type { ServiceHealthItem } from '@/lib/services';

export default function ServiceMonitorPage() {
  const [services, setServices] = useState<ServiceHealthItem[]>([]);
  const [systemHealth, setSystemHealth] = useState<'HEALTHY' | 'DEGRADED' | 'CRITICAL'>('HEALTHY');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceHealthItem | null>(null);

  const fetchServiceStatus = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/services/status');
      if (res.ok) {
        const json = await res.json();
        setServices(json.services || []);
        setSystemHealth(json.systemHealth || 'HEALTHY');
      }
    } catch (err: any) {
      console.error('Error fetching service status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchServiceStatus();
  }, []);

  const runningCount = services.filter((s) => s.status === 'RUNNING' || s.status === 'WAITING').length;
  const failedCount = services.filter((s) => s.status === 'FAILED').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Server className="w-6 h-6 text-blue-600" />
              <span>Monitoring Background Services & Daemon Pipeline</span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            Real-time health monitoring of ASOC background microservices and pipeline daemons.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchServiceStatus(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Auditing Services...' : 'Audit Services'}</span>
          </button>
        </div>
      </div>

      {/* System Health Status Summary Card */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          systemHealth === 'HEALTHY'
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-950'
            : systemHealth === 'DEGRADED'
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-950'
            : 'bg-rose-500/10 border-rose-500/25 text-rose-950'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${
              systemHealth === 'HEALTHY'
                ? 'bg-emerald-500/20 text-emerald-600'
                : systemHealth === 'DEGRADED'
                ? 'bg-amber-500/20 text-amber-600'
                : 'bg-rose-500/20 text-rose-600'
            }`}
          >
            {systemHealth === 'HEALTHY' ? (
              <ShieldCheck className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight">
                System Pipeline Status: {systemHealth}
              </span>
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              {systemHealth === 'HEALTHY'
                ? 'All background microservices and databases are operating normally without log stream bottlenecks.'
                : `${failedCount} service(s) encountered operational issues.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono font-bold flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/50">
            <span className="text-slate-400 font-sans font-normal">Active:</span>
            <span className="text-emerald-600">{runningCount} / {services.length}</span>
          </div>
        </div>
      </div>

      {/* Services Live Status Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-600" />
            <span>Health Matrix: Background Daemon Services</span>
          </h2>
          <span className="text-xs text-slate-400">Click a service card to inspect details</span>
        </div>

        <ServiceStatusGrid
          services={services}
          loading={loading}
          onSelectService={(service) => setSelectedService(service)}
        />
      </div>

      {/* Pipeline Execution Deep-Dive Cards */}
      <div className="space-y-3 pt-2">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-600" />
          <span>Last Batching Execution Cycle Telemetry</span>
        </h2>

        <DaemonExecutionCard services={services} loading={loading} />
      </div>

      {/* Detail Modal */}
      <DaemonDetailModal
        isOpen={Boolean(selectedService)}
        onClose={() => setSelectedService(null)}
        service={selectedService}
      />
    </div>
  );
}
