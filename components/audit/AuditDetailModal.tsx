'use client';

import React from 'react';
import {
  X,
  ShieldCheck,
  User,
  Globe,
  Clock,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Code,
  Copy,
  Check,
} from 'lucide-react';

interface AuditDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: any | null;
}

export function AuditDetailModal({
  isOpen,
  onClose,
  log,
}: AuditDetailModalProps) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !log) return null;

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Inspeksi Detail Audit Trail #{log.id}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {log.timestamp}
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
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2.5 font-mono">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block font-sans">Admin Username</span>
              <span className="font-bold text-slate-900 text-xs">{log.adminUsername}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block font-sans">IP Address</span>
              <span className="font-bold text-blue-500 text-xs">{log.ipAddress}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block font-sans">Tipe Aksi</span>
              <span className="font-bold text-indigo-500 text-xs">{log.actionType}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60">
              <span className="text-slate-400 text-[10px] block font-sans">Status</span>
              <span
                className={`font-bold text-xs ${
                  log.status === 'SUCCESS' ? 'text-emerald-500' : 'text-rose-500'
                }`}
              >
                {log.status}
              </span>
            </div>
          </div>

          {/* Target Resource */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 font-mono">
            <span className="text-slate-400 text-[10px] block font-sans mb-0.5">Target Resource:</span>
            <span className="font-bold text-slate-800 break-all">{log.targetResource}</span>
          </div>

          {/* Raw JSON Payload */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">
                Raw JSON Payload & Details:
              </span>
              <button
                type="button"
                onClick={copyJson}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-500 hover:underline cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre className="p-4 rounded-2xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-slate-800 max-h-56">
              {JSON.stringify(log.details || {}, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-end bg-slate-50/50 flex-shrink-0">
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
