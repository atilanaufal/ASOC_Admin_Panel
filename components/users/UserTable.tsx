'use client';

import React from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  KeyRound,
  Trash2,
  Edit2,
  Building2,
  Mail,
  Calendar,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { UserItem } from '@/lib/users';

interface UserTableProps {
  users: UserItem[];
  loading: boolean;
  onResetPassword: (user: UserItem) => void;
  onEditUser: (user: UserItem) => void;
  onDeleteUser: (user: UserItem) => void;
}

export function UserTable({
  users,
  loading,
  onResetPassword,
  onEditUser,
  onDeleteUser,
}: UserTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <UserIcon className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold text-slate-800">Tidak ada pengguna ditemukan</h3>
        <p className="text-xs text-slate-500 mt-1">
          Coba sesuaikan kata kunci pencarian atau filter kampus/role Anda.
        </p>
      </div>
    );
  }

  const renderRoleBadge = (role: string) => {
    const cleanRole = (role || 'tenant').toLowerCase();
    if (cleanRole === 'superadmin' || cleanRole === 'admin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>SUPERADMIN</span>
        </span>
      );
    }
    if (cleanRole === 'tenant_admin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>TENANT ADMIN</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-500/10 text-slate-600 border border-slate-500/20">
        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
        <span>ANALIS KAMPUS</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="p-4 pl-6">Pengguna & Akun</th>
              <th className="p-4">Kampus / Tenant Terikat</th>
              <th className="p-4">Hak Akses (Role)</th>
              <th className="p-4">Tanggal Registrasi</th>
              <th className="p-4">Status Akses</th>
              <th className="p-4 pr-6 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {users.map((u) => {
              const isSuper = u.role === 'superadmin';
              const tenantActive = u.tenant_is_active === undefined || u.tenant_is_active === 1;

              return (
                <tr
                  key={u.id}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  {/* User & Account */}
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-500 flex-shrink-0">
                        {(u.username || (u as any).name || 'US').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          <span>{u.username || (u as any).name}</span>
                          {isSuper && (
                            <span className="text-[10px] font-mono text-indigo-500 font-semibold bg-indigo-500/10 px-1.5 rounded">
                              MASTER
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{u.email || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Campus / Tenant */}
                  <td className="p-4">
                    {isSuper ? (
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        <span>ASOC Central Management (Global)</span>
                      </div>
                    ) : (
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 font-mono text-[10px] font-extrabold border border-blue-500/20">
                            {u.tenant_code || 'TENANT'}
                          </span>
                          <span>{u.campus_name || 'Kampus'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          DB: {u.database_name || '-'}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Role */}
                  <td className="p-4">{renderRoleBadge(u.role)}</td>

                  {/* Registered Date */}
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '-'}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="p-4">
                    {tenantActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>AKTIF</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                        <AlertTriangle className="w-3 h-3" />
                        <span>SUSPENDED</span>
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-4 pr-6 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Reset Password Button */}
                      <button
                        onClick={() => onResetPassword(u)}
                        title="Reset Password Pengguna"
                        className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer border border-transparent hover:border-blue-500/20"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>

                      {/* Edit Profile Button */}
                      <button
                        onClick={() => onEditUser(u)}
                        title="Edit Profil / Role"
                        className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      {!isSuper && (
                        <button
                          onClick={() => onDeleteUser(u)}
                          title="Delete User & Cabut Sesi"
                          className="p-2 rounded-xl bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-500/20"
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
