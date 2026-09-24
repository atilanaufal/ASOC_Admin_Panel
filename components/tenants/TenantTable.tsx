'use client';

import React from 'react';
import {
  Building2,
  Database,
  Users,
  Trash2,
  Edit2,
  Radio,
} from 'lucide-react';
import type { TenantItem } from '@/lib/tenants';

interface TenantTableProps {
  tenants: TenantItem[];
  loading: boolean;
  currentUserRole?: string;
  onStatusChange?: (tenantId: number, newStatus: 'ACTIVE' | 'SUSPENDED') => Promise<void>;
  onEditTenant: (tenant: TenantItem) => void;
  onDeleteTenant: (tenant: TenantItem) => void;
}

export function TenantTable({
  tenants,
  loading,
  currentUserRole = 'admin',
  onEditTenant,
  onDeleteTenant,
}: TenantTableProps) {
  const isSuperadmin = currentUserRole === 'superadmin';

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Building2 className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold text-slate-800">No tenants registered</h3>
        <p className="text-xs text-slate-500 mt-1">
          Register a new tenant by clicking &quot;Provision New Tenant&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">Tenant Table</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
            {tenants.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <th className="py-3 px-4 rounded-l-xl">Tenant Profile</th>
              <th className="py-3 px-4">MongoDB Database</th>
              <th className="py-3 px-4">Redis Namespace</th>
              <th className="py-3 px-4 rounded-r-xl text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((t) => {
              return (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {/* Tenant Profile */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center font-bold text-[#00BCD4] font-mono flex-shrink-0 text-xs shadow-2xs">
                        {t.tenant_code}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">
                          {t.campus_name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 font-medium">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#00BCD4]" />
                            <span>{t.userCount} User{t.userCount !== 1 ? 's' : ''}</span>
                          </span>
                          <span>•</span>
                          <span>Reg: {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* MongoDB Database */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-mono font-bold text-slate-900 text-sm">{t.database_name}</span>
                    </div>
                  </td>

                  {/* Redis Namespace */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-[#00BCD4] flex-shrink-0" />
                      <span className="font-mono font-bold text-slate-900 text-sm">{t.redis_prefix}*</span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEditTenant(t)}
                        title="Edit Tenant Profile"
                        className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-[#00BCD4] hover:bg-cyan-50 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {isSuperadmin && (
                        <button
                          onClick={() => onDeleteTenant(t)}
                          title="Delete Tenant Registry"
                          className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
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
