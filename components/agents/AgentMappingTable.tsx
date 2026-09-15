'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Server,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  Save,
  Loader2,
  Monitor,
} from 'lucide-react';
import { MappedAgentItem } from '@/app/api/wazuh/agents/route';

interface TenantOption {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
}

interface AgentMappingTableProps {
  agents: MappedAgentItem[];
  tenants: TenantOption[];
  loading: boolean;
  onUpdateMapping: (agentId: string, agentName: string, tenantCode: string) => Promise<void>;
  onOpenEnrollmentModal: (tenantCode?: string) => void;
}

export function AgentMappingTable({
  agents,
  tenants,
  loading,
  onUpdateMapping,
  onOpenEnrollmentModal,
}: AgentMappingTableProps) {
  // State for pending mapping changes: agentId -> selected tenantCode
  const [selectedTenantMap, setSelectedTenantMap] = useState<Record<string, string>>({});
  const [updatingAgentId, setUpdatingAgentId] = useState<string | null>(null);

  const handleSelectChange = (agentId: string, tenantCode: string) => {
    setSelectedTenantMap((prev) => ({
      ...prev,
      [agentId]: tenantCode,
    }));
  };

  const handleSaveMapping = async (agent: MappedAgentItem) => {
    const targetTenantCode = selectedTenantMap[agent.id] || agent.assignedTenant?.tenantCode;
    if (!targetTenantCode) return;

    setUpdatingAgentId(agent.id);
    try {
      await onUpdateMapping(agent.id, agent.name, targetTenantCode);
    } finally {
      setUpdatingAgentId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Server className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold text-slate-800">Tidak ada agen Wazuh ditemukan</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Belum ada agen yang terhubung ke server Wazuh Manager :55000.
        </p>
        <button
          onClick={() => onOpenEnrollmentModal()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
        >
          <span>Buka Panduan Pendaftaran Agen</span>
        </button>
      </div>
    );
  }

  const renderOsBadge = (os: any) => {
    const name = os?.name || os?.platform || 'Linux';
    const lower = name.toLowerCase();

    let color = 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (lower.includes('windows')) {
      color = 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
    } else if (lower.includes('ubuntu') || lower.includes('debian')) {
      color = 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    } else if (lower.includes('centos') || lower.includes('rhel')) {
      color = 'bg-red-500/10 text-red-600 border-red-500/20';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${color}`}>
        <Monitor className="w-3 h-3" />
        <span>{name} {os?.version ? `(${os.version})` : ''}</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="p-4 pl-6">ID & Nama Agen</th>
              <th className="p-4">IP & Detak Jantung (Keepalive)</th>
              <th className="p-4">Sistem Operasi</th>
              <th className="p-4">Grup Wazuh Terdaftar</th>
              <th className="p-4">Pemetaan Kampus / Tenant Target</th>
              <th className="p-4 pr-6 text-right">Parity Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {agents.map((agent) => {
              const isActive = agent.status === 'active';
              const currentTenantCode =
                selectedTenantMap[agent.id] !== undefined
                  ? selectedTenantMap[agent.id]
                  : agent.assignedTenant?.tenantCode || '';

              const hasUnsavedChange =
                selectedTenantMap[agent.id] !== undefined &&
                selectedTenantMap[agent.id] !== (agent.assignedTenant?.tenantCode || '');

              const isSaving = updatingAgentId === agent.id;

              return (
                <tr
                  key={agent.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* Agent ID & Name */}
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-blue-500 flex-shrink-0">
                        {agent.id}
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{agent.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {agent.version}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* IP Address & Keepalive */}
                  <td className="p-4">
                    <div className="space-y-1">
                      <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        <span>{agent.ip}</span>
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                          }`}
                        >
                          {agent.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Keepalive: {agent.lastKeepAlive}</span>
                      </div>
                    </div>
                  </td>

                  {/* OS Info */}
                  <td className="p-4">{renderOsBadge(agent.os)}</td>

                  {/* Wazuh Groups */}
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {agent.groups.map((g, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-bold border border-slate-200 truncate max-w-[140px]"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Campus Mapping Dropdown */}
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          value={currentTenantCode}
                          onChange={(e) => handleSelectChange(agent.id, e.target.value)}
                          className="px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                          <option value="">-- Belum Dipetakan --</option>
                          {tenants.map((t) => (
                            <option key={t.id} value={t.tenantCode}>
                              {t.campusName} ({t.tenantCode})
                            </option>
                          ))}
                        </select>
                      </div>

                      {hasUnsavedChange && (
                        <button
                          type="button"
                          onClick={() => handleSaveMapping(agent)}
                          disabled={isSaving}
                          title="Save pemetaan grup ke Wazuh & Mongo"
                          className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Parity Status */}
                  <td className="p-4 pr-6 text-right">
                    {agent.isMapped ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>TERPETAKAN</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>UNASSIGNED</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
