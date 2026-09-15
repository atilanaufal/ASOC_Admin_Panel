'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { AuditFilterBar } from '@/components/audit/AuditFilterBar';
import { AuditLogTable } from '@/components/audit/AuditLogTable';
import { AuditDetailModal } from '@/components/audit/AuditDetailModal';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Pagination
  const [pagination, setPagination] = useState({
    currentPage: 1,
    pageSize: 25,
    totalRecords: 0,
    totalPages: 1,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [actionType, setActionType] = useState('all');
  const [status, setStatus] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Log for Modal
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async (page = 1, isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        search,
        actionType,
        status,
        startDate,
        endDate,
      });

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
        if (json.pagination) {
          setPagination(json.pagination);
        }
      }
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [search, actionType, status, startDate, endDate]);

  const handleExportCsv = () => {
    const params = new URLSearchParams({
      search,
      actionType,
      status,
      startDate,
      endDate,
      format: 'csv',
    });
    window.open(`/api/audit-logs?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              <span>Admin Activity Audit Trail</span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            Comprehensive activity audit trail and Superadmin administrative governance logs.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(pagination.currentPage, true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Logs</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Activities</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {pagination.totalRecords}
            </div>
            <span className="text-[11px] text-blue-500 font-semibold mt-1 block">Recorded in Database</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Successful Actions</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {logs.filter((l) => l.status === 'SUCCESS').length}
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold mt-1 block">Status SUCCESS</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Failed Actions</span>
            <div className="text-2xl font-extrabold text-slate-600 mt-1">
              {logs.filter((l) => l.status === 'FAILED').length}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Status FAILED</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Selected Action Type</span>
            <div className="text-sm font-mono font-extrabold text-indigo-600 mt-1 truncate max-w-[140px]">
              {actionType === 'all' ? 'All Actions' : actionType}
            </div>
            <span className="text-[11px] text-indigo-500 font-semibold mt-1 block">Filter Active</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Export Bar */}
      <AuditFilterBar
        search={search}
        onSearchChange={setSearch}
        actionType={actionType}
        onActionTypeChange={setActionType}
        status={status}
        onStatusChange={setStatus}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onExportCsv={handleExportCsv}
      />

      {/* Interactive Audit Log Table */}
      <AuditLogTable
        logs={logs}
        loading={loading}
        pagination={pagination}
        onPageChange={(p) => fetchLogs(p)}
        onSelectLog={(log) => setSelectedLog(log)}
      />

      {/* Detail JSON Modal */}
      <AuditDetailModal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        log={selectedLog}
      />
    </div>
  );
}
