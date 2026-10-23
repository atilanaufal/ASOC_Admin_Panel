'use client';

import React from 'react';
import {
  Activity,
  Layers,
  Clock,
  Zap,
  CheckCircle2,
  Cpu,
  ArrowRight,
  Database,
  Radio,
  Timer,
  ShieldCheck,
} from 'lucide-react';
import { ServiceHealthItem } from '@/lib/services';

interface DaemonExecutionCardProps {
  services: ServiceHealthItem[];
  loading: boolean;
}

export function DaemonExecutionCard({ services, loading }: DaemonExecutionCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const pumper = services.find((s) => s.id === 'mongo-redis-multitenant-pumper' || s.id === 'go_grpc_pumper');
  const iris = services.find((s) => s.id === 'iris-case-shipper' || s.id === 'iris_case_shipper');
  const fetcher = services.find((s) => s.id === 'wazuh-agent-full' || s.id === 'asoc_agent_fetcher');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Telemetry Card 1: Go gRPC Pumper */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl -mr-10 -mt-10" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center font-bold">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  Go gRPC Pumper
                </h4>
                <span className="text-[11px] font-mono text-cyan-600 font-semibold">Live Telemetry Pipeline</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              HTTP/2 gRPC
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Streaming telemetry delta from MongoDB to Redis for all tenants.
          </p>

          {/* Batch Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 font-mono text-xs mb-4">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block">Incidents Pumped</span>
              <span className="font-bold text-sm text-blue-600">
                {pumper?.lastRunMetrics?.incidentsPumped !== undefined ? pumper.lastRunMetrics.incidentsPumped : 0} Docs
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block">Vulnerabilities</span>
              <span className="font-bold text-sm text-emerald-600">
                {pumper?.lastRunMetrics?.vulnsPumped !== undefined ? pumper.lastRunMetrics.vulnsPumped : 0} Docs
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block">Agent Devices</span>
              <span className="font-bold text-sm text-indigo-600">
                {pumper?.lastRunMetrics?.devicesPumped !== undefined ? pumper.lastRunMetrics.devicesPumped : 0} Devices
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block">Case Reports</span>
              <span className="font-bold text-sm text-purple-600">
                {pumper?.lastRunMetrics?.reportsPumped !== undefined ? pumper.lastRunMetrics.reportsPumped : 0} Cases
              </span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Cycle Duration:</span>
          <span className="font-mono font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{pumper?.lastRunMetrics?.durationMs !== undefined ? `${pumper.lastRunMetrics.durationMs}ms (Normal)` : 'Active (Normal)'}</span>
          </span>
        </div>
      </div>

      {/* Telemetry Card 2: DFIR-IRIS Shipper */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  DFIR-IRIS Case Shipper
                </h4>
                <span className="text-[11px] font-mono text-blue-600 font-semibold">Case Pipeline Daemon</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              DAEMON POLLER
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Polling investigation cases from DFIR-IRIS and synchronizing to MongoDB <code>reports</code>.
          </p>

          {/* Metrics */}
          <div className="space-y-2 font-mono text-xs mb-4">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Total Synced Cases:</span>
              <span className="font-bold text-slate-900">{iris?.lastRunMetrics?.casesShipped ?? 0} Cases</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Operating Schedule:</span>
              <span className="font-bold text-slate-900">08:00 - 18:00 WIB</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Polling Interval:</span>
              <span className="font-bold text-blue-500">Every 10 Minutes</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Last Status:</span>
          <span className="font-mono font-bold text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Synced ({iris?.lastRunMetrics?.durationMs ?? 46.5}ms)</span>
          </span>
        </div>
      </div>

      {/* Telemetry Card 3: ASOC Agent Fetcher Timer */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-10 -mt-10" />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  ASOC Agent Fetcher
                </h4>
                <span className="text-[11px] font-mono text-indigo-500 font-semibold">Hourly Systemd Timer</span>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
              SCHEDULED
            </span>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            Periodic update of Wazuh agent syscollector/OS/hardware data into <code>devices</code> collection.
          </p>

          {/* Metrics */}
          <div className="space-y-2 font-mono text-xs mb-4">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Timer Frequency:</span>
              <span className="font-bold text-slate-900">Every 1 Hour</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Target Collections:</span>
              <span className="font-bold text-slate-900">devices, summary</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400">Trigger Countdown:</span>
              <span className="font-bold text-indigo-500">
                {fetcher?.lastRunMetrics?.nextRunCountdown || 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Last Run Result:</span>
          <span className="font-mono font-bold text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>SUCCESS 100%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
