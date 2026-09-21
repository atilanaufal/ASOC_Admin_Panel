'use client';

import React from 'react';
import {
  X,
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Zap,
  Radio,
  Database,
  Terminal,
} from 'lucide-react';
import { ServiceHealthItem } from '@/lib/services';

interface DaemonDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceHealthItem | null;
}

export function DaemonDetailModal({
  isOpen,
  onClose,
  service,
}: DaemonDetailModalProps) {
  if (!isOpen || !service) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {service.name}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                ID: {service.id} • Tipe: {service.type.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Status badge & Latency */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Status Operasional:</span>
              <span
                className={`font-extrabold px-2.5 py-0.5 rounded-full text-[10px] ${
                  service.status === 'RUNNING'
                    ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                    : service.status === 'WAITING'
                    ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                    : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                }`}
              >
                {service.status}
              </span>
            </div>
            {service.latencyMs !== undefined && (
              <span className="font-mono text-emerald-600 font-bold">
                Latency: {service.latencyMs}ms
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-1">
              Peran & Deskripsi Alur Data:
            </span>
            <p className="text-slate-700 leading-relaxed font-medium">
              {service.description}
            </p>
          </div>

          {/* Specs */}
          <div className="grid grid-cols-2 gap-2 font-mono">
            {service.protocol && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 col-span-2">
                <span className="text-slate-400 text-[10px] block">Protokol</span>
                <span className="font-bold text-slate-800">{service.protocol}</span>
              </div>
            )}
            {service.uptime && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 col-span-2">
                <span className="text-slate-400 text-[10px] block">Kondisi Uptime</span>
                <span className="font-bold text-emerald-600">{service.uptime}</span>
              </div>
            )}
          </div>

          {/* Telemetry Metrics JSON */}
          {service.lastRunMetrics && (
            <div className="space-y-1.5">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">
                Metrik Siklus Eksekusi Terakhir:
              </span>
              <pre className="p-3.5 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-slate-800">
                {JSON.stringify(service.lastRunMetrics, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-end bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 text-slate-800 text-xs font-bold rounded-xl hover:bg-slate-300 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
