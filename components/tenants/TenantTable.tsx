'use client';

import React from 'react';
import {
  Building2,
  Database,
  Users,
  HardDrive,
  Mail,
  Phone,
  Trash2,
  Edit2,
  Layers,
  Radio,
  ExternalLink,
} from 'lucide-react';
import type { TenantItem } from '@/lib/tenants';
import { StorageUsageBar } from './StorageUsageBar';
import { TenantStatusToggle } from './TenantStatusToggle';

interface TenantTableProps {
  tenants: TenantItem[];
  loading: boolean;
  onStatusChange: (tenantId: number, newStatus: 'ACTIVE' | 'SUSPENDED') => Promise<void>;
  onEditTenant: (tenant: TenantItem) => void;
  onDeleteTenant: (tenant: TenantItem) => void;
}

export function TenantTable({
  tenants,
  loading,
  onStatusChange,
  onEditTenant,
  onDeleteTenant,
}: TenantTableProps) {
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
        <h3 className="text-base font-bold text-slate-800">Tidak ada kampus terdaftar</h3>
        <p className="text-xs text-slate-500 mt-1">
          Daftarkan kampus baru dengan menekan tombol &quot;Provisi Tenant Baru&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="p-4 pl-6">Profil Kampus / Tenant</th>
              <th className="p-4">Database & Redis Namespace</th>
              <th className="p-4">PIC SOC Kampus</th>
              <th className="p-4">Kapasitas Disk Mongo</th>
              <th className="p-4">Cache Keys</th>
              <th className="p-4">Status Akses</th>
              <th className="p-4 pr-6 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {tenants.map((t) => {
              return (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* Campus Profile */}
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center font-extrabold text-blue-600 font-mono flex-shrink-0 text-xs">
                        {t.tenant_code}
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">
                          {t.campus_name}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 font-medium">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-500" />
                            <span>{t.userCount} User</span>
                          </span>
                          <span>•</span>
                          <span>Reg: {new Date(t.created_at).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Database & Redis */}
                  <td className="p-4 font-mono">
                    <div className="space-y-1">
                      <div className="text-slate-800 font-bold flex items-center gap-1.5 text-xs">
                        <Database className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{t.database_name}</span>
                      </div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-1.5">
                        <Radio className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{t.redis_prefix}</span>
                      </div>
                    </div>
                  </td>

                  {/* PIC Details */}
                  <td className="p-4">
                    <div>
                      <div className="font-bold text-slate-900">
                        {t.pic_name !== '-' ? t.pic_name : `Admin SOC ${t.tenant_code}`}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{t.pic_email !== '-' ? t.pic_email : `soc@${t.database_name}.ac.id`}</span>
                      </div>
                    </div>
                  </td>

                  {/* Storage Usage Bar */}
                  <td className="p-4">
                    <StorageUsageBar storage={t.storage} />
                  </td>

                  {/* Redis Keys */}
                  <td className="p-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-500/20 font-mono text-xs font-bold">
                      <Radio className="w-3 h-3" />
                      <span>{t.redisKeyCount} Keys</span>
                    </div>
                  </td>

                  {/* Status Toggle */}
                  <td className="p-4">
                    <TenantStatusToggle tenant={t} onStatusChange={onStatusChange} />
                  </td>

                  {/* Actions */}
                  <td className="p-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEditTenant(t)}
                        title="Edit Profil Kampus / PIC"
                        className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => onDeleteTenant(t)}
                        title="Hapus Registri Tenant"
                        className="p-2 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
