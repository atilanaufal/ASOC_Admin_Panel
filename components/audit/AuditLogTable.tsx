'use client';

import React from 'react';
import {
  Clock,
  User,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code,
  Layers,
  Server,
} from 'lucide-react';

interface AuditLogItem {
  id: number;
  timestamp: string;
  adminUsername: string;
  ipAddress: string;
  userAgent?: string;
  actionType: string;
  targetResource?: string;
  status: 'SUCCESS' | 'FAILED';
  details?: any;
}

interface AuditLogTableProps {
  logs: AuditLogItem[];
  loading: boolean;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalRecords: number;
    totalPages: number;
  };
  onPageChange: (newPage: number) => void;
  onSelectLog: (log: AuditLogItem) => void;
}

export function AuditLogTable({
  logs,
  loading,
  pagination,
  onPageChange,
  onSelectLog,
}: AuditLogTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Server className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold text-slate-800">Tidak ada log audit ditemukan</h3>
        <p className="text-xs text-slate-500 mt-1">
          Tidak ada riwayat aktivitas administratif yang cocok dengan filter yang diterapkan.
        </p>
      </div>
    );
  }

  const renderActionBadge = (action: string) => {
    let color = 'bg-blue-500/10 text-blue-600 border-blue-500/20';

    if (action.startsWith('USER_')) {
      color = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    } else if (action.startsWith('TENANT_')) {
      color = 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    } else if (action === 'REDIS_CACHE_FLUSH' || action === 'MONGO_DATA_CLEANUP') {
      color = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    } else if (action === 'MANUAL_SYNC_TRIGGER' || action === 'AGENT_MAPPING_UPDATE') {
      color = 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${color}`}>
        <span>{action}</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="p-4 pl-6">Waktu & ID</th>
              <th className="p-4">Admin & IP Address</th>
              <th className="p-4">Tipe Aksi</th>
              <th className="p-4">Target Resource</th>
              <th className="p-4">Status</th>
              <th className="p-4 pr-6 text-right">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {logs.map((log) => {
              return (
                <tr
                  key={log.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* Timestamp & ID */}
                  <td className="p-4 pl-6 font-mono">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{log.timestamp}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Log #{log.id}
                    </div>
                  </td>

                  {/* Admin & IP */}
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                        {log.adminUsername.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">
                          {log.adminUsername}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {log.ipAddress}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Action Type */}
                  <td className="p-4">{renderActionBadge(log.actionType)}</td>

                  {/* Target Resource */}
                  <td className="p-4 font-mono text-xs text-slate-700">
                    <span className="truncate max-w-[200px] block" title={log.targetResource}>
                      {log.targetResource || '-'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="p-4">
                    {log.status === 'SUCCESS' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>SUCCESS</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>FAILED</span>
                      </span>
                    )}
                  </td>

                  {/* Action Button */}
                  <td className="p-4 pr-6 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectLog(log)}
                      className="p-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Code className="w-3.5 h-3.5 text-blue-500" />
                      <span>Inspect</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-4 px-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
        <div>
          Menampilkan <span className="font-bold text-slate-800">{logs.length}</span> dari{' '}
          <span className="font-bold text-slate-800">{pagination.totalRecords}</span> aktivitas
        </div>

        <div className="flex items-center gap-2 font-mono">
          <button
            type="button"
            disabled={pagination.currentPage <= 1}
            onClick={() => onPageChange(pagination.currentPage - 1)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-2 font-bold text-slate-800">
            Halaman {pagination.currentPage} / {pagination.totalPages || 1}
          </span>

          <button
            type="button"
            disabled={pagination.currentPage >= pagination.totalPages}
            onClick={() => onPageChange(pagination.currentPage + 1)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
