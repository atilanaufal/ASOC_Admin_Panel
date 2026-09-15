'use client';

import React from 'react';
import {
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
  Zap,
  Database,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { ServiceHealthItem } from '@/lib/services';

interface ServiceStatusGridProps {
  services: ServiceHealthItem[];
  loading: boolean;
  onSelectService: (service: ServiceHealthItem) => void;
}

export function ServiceStatusGrid({
  services,
  loading,
  onSelectService,
}: ServiceStatusGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-44 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const getServiceIcon = (id: string) => {
    switch (id) {
      case 'fluent_bit':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'go_grpc_pumper':
        return <Activity className="w-5 h-5 text-cyan-500" />;
      case 'iris_case_shipper':
        return <Layers className="w-5 h-5 text-blue-500" />;
      case 'asoc_agent_fetcher':
        return <Clock className="w-5 h-5 text-indigo-500" />;
      case 'mongod':
        return <Database className="w-5 h-5 text-emerald-500" />;
      case 'redis':
        return <Radio className="w-5 h-5 text-rose-500" />;
      case 'mysql':
        return <Database className="w-5 h-5 text-blue-500" />;
      default:
        return <Server className="w-5 h-5 text-slate-400" />;
    }
  };

  const renderStatusBadge = (status: string) => {
    if (status === 'RUNNING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>RUNNING</span>
        </span>
      );
    }
    if (status === 'WAITING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 border border-blue-500/20">
          <Clock className="w-3 h-3 text-blue-500" />
          <span>SCHEDULED</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-600 border border-rose-500/20">
        <AlertTriangle className="w-3 h-3 text-rose-500" />
        <span>FAILED</span>
      </span>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {services.map((service) => {
        return (
          <div
            key={service.id}
            onClick={() => onSelectService(service)}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:border-blue-500/40 transition-all cursor-pointer flex flex-col justify-between group"
          >
            <div>
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  {getServiceIcon(service.id)}
                </div>
                {renderStatusBadge(service.status)}
              </div>

              {/* Title & Description */}
              <h3 className="font-extrabold text-sm text-slate-900 leading-snug">
                {service.name}
              </h3>
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                {service.description}
              </p>
            </div>

            {/* Bottom Meta */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">
                {service.port ? `Port :${service.port}` : service.type.toUpperCase()}
              </span>
              {service.latencyMs !== undefined ? (
                <span className="text-emerald-600 font-bold">
                  {service.latencyMs}ms
                </span>
              ) : (
                <span className="text-blue-500 font-bold font-sans text-[10px]">
                  Detail Telemetri &rarr;
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
