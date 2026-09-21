'use client';

import React from 'react';
import {
  Search,
  Filter,
  Download,
  Calendar,
  X,
  ShieldAlert,
  Activity,
  Layers,
} from 'lucide-react';

interface AuditFilterBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  actionType: string;
  onActionTypeChange: (val: string) => void;
  status: string;
  onStatusChange: (val: string) => void;
  startDate: string;
  onStartDateChange: (val: string) => void;
  endDate: string;
  onEndDateChange: (val: string) => void;
  onExportCsv: () => void;
}

export function AuditFilterBar({
  search,
  onSearchChange,
  actionType,
  onActionTypeChange,
  status,
  onStatusChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onExportCsv,
}: AuditFilterBarProps) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
      {/* Top Filter Row: Search & Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search admin, target resource, IP address, or action type..."
            className="w-full pl-9 pr-4 py-2 bg-white hover:bg-slate-50 rounded-xl border border-slate-200/80 shadow-2xs text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Export Button */}
        <button
          type="button"
          onClick={onExportCsv}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex-shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export to CSV</span>
        </button>
      </div>

      {/* Bottom Filter Row: Action, Status, Date Range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
        {/* Action Type Dropdown */}
        <div className="flex items-center gap-2 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs transition-all">
          <Layers className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <select
            value={actionType}
            onChange={(e) => onActionTypeChange(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 outline-none w-full cursor-pointer text-xs"
          >
            <option value="all">All Action Types</option>
            <option value="AUTH_LOGIN">Admin Login (AUTH_LOGIN)</option>
            <option value="USER_CREATE">Create User (USER_CREATE)</option>
            <option value="USER_UPDATE">Update User (USER_UPDATE)</option>
            <option value="USER_DELETE">Delete User (USER_DELETE)</option>
            <option value="USER_RESET_PASSWORD">Reset Password</option>
            <option value="TENANT_CREATE">Tenant Provisioning</option>
            <option value="TENANT_UPDATE">Update Tenant</option>
            <option value="TENANT_STATUS_TOGGLE">Toggle Tenant Status</option>
            <option value="TENANT_DELETE">Delete Tenant</option>
            <option value="AGENT_MAPPING_UPDATE">Update Agent Mapping</option>
            <option value="MANUAL_SYNC_TRIGGER">Manual Sync Trigger</option>
            <option value="REDIS_CACHE_FLUSH">Flush Redis Cache</option>
            <option value="MONGO_DATA_CLEANUP">Purge Mongo Data</option>
          </select>
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-2 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs transition-all">
          <Activity className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="bg-transparent font-semibold text-slate-800 outline-none w-full cursor-pointer text-xs"
          >
            <option value="all">All Statuses (Success & Failed)</option>
            <option value="SUCCESS">Success Only (SUCCESS)</option>
            <option value="FAILED">Failed Only (FAILED)</option>
          </select>
        </div>

        {/* Start Date */}
        <div className="flex items-center gap-2 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs transition-all">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 font-semibold">From:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="bg-transparent font-mono font-semibold text-slate-800 outline-none w-full text-xs"
          />
        </div>

        {/* End Date */}
        <div className="flex items-center gap-2 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 shadow-2xs transition-all">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-[10px] text-slate-400 font-semibold">To:</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="bg-transparent font-mono font-semibold text-slate-800 outline-none w-full text-xs"
          />
        </div>
      </div>
    </div>
  );
}
