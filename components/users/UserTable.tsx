'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  User as UserIcon,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Trash2,
  Edit2,
} from 'lucide-react';
import type { UserItem } from '@/lib/users';



interface UserTableProps {
  users: UserItem[];
  loading: boolean;
  currentUserRole?: string;
  currentUsername?: string;
  onResetPassword: (user: UserItem) => void;
  onEditUser: (user: UserItem) => void;
  onDeleteUser: (user: UserItem) => void;
}

export function UserTable({
  users,
  loading,
  currentUserRole = 'admin',
  currentUsername = '',
  onResetPassword,
  onEditUser,
  onDeleteUser,
}: UserTableProps) {
  const isSuperadmin = currentUserRole === 'superadmin';

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/60 p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
        <UserIcon className="w-12 h-12 text-slate-400 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold text-slate-800">No users found</h3>
        <p className="text-xs text-slate-500 mt-1">
          Try adjusting search filters or register a new user account.
        </p>
      </div>
    );
  }

  const renderRoleBadge = (role: string) => {
    const cleanRole = (role || 'tenant').toLowerCase();
    if (cleanRole === 'superadmin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
          <span>SUPERADMIN</span>
        </span>
      );
    }
    if (cleanRole === 'admin') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>ADMIN</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        <UserIcon className="w-3.5 h-3.5 text-emerald-500" />
        <span>USER</span>
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-800">User Management Table</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
            {users.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-900 font-bold text-xs uppercase tracking-wider">
              <th className="py-3 px-4 rounded-l-xl">User & Account</th>
              <th className="py-3 px-4">Assigned Tenant</th>
              <th className="py-3 px-4">Role & Permissions</th>
              <th className="py-3 px-4">Registration Date</th>
              <th className="py-3 px-4">Access Status</th>
              <th className="py-3 px-4 rounded-r-xl text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const isAdmin = u.role === 'admin' || u.role === 'superadmin';
              const tenantActive = u.tenant_is_active === undefined || u.tenant_is_active === 1;
              const isSelf = Boolean(
                currentUsername &&
                (u.username === currentUsername || String(u.id) === currentUsername)
              );

              return (
                <tr
                  key={u.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {/* User & Account */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#F0F4F8] border border-slate-200/80 flex items-center justify-center font-bold text-[#00BCD4] font-mono flex-shrink-0 text-xs shadow-2xs">
                        {(u.username || (u as any).name || 'US').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                          <span>{u.username || (u as any).name}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Tenant */}
                  <td className="py-3.5 px-4">
                    {isAdmin ? (
                      <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                        <Building2 className="w-4 h-4 text-indigo-500" />
                        <span>ASOC Central Management (Global)</span>
                      </div>
                    ) : (
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-cyan-50 text-[#00BCD4] font-mono text-[10px] font-bold border border-cyan-100">
                            {u.tenant_code || 'TENANT'}
                          </span>
                          <span>{u.campus_name || 'Tenant'}</span>
                        </div>

                      </div>
                    )}
                  </td>

                  {/* Role */}
                  <td className="py-3.5 px-4">{renderRoleBadge(u.role)}</td>

                  {/* Registered Date */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {u.created_at
                          ? new Date(u.created_at).toLocaleDateString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '-'}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    {tenantActive ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ACTIVE</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200/60">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>SUSPENDED</span>
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Reset Password Button (Admin cannot change Superadmin password) */}
                      {(() => {
                        const isTargetSuperadmin = u.role === 'superadmin';
                        const canModify = isSuperadmin || !isTargetSuperadmin;
                        return (
                          <>
                            <button
                              disabled={!canModify}
                              onClick={() => canModify && onResetPassword(u)}
                              title={canModify ? "Reset User Password" : "Superadmin password cannot be reset by Admin"}
                              className={`p-2 rounded-xl transition-all ${
                                canModify
                                  ? "bg-slate-50 text-slate-400 hover:text-[#00BCD4] hover:bg-cyan-50 cursor-pointer"
                                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
                              }`}
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            {/* Edit Profile Button (Admin cannot edit Superadmin account) */}
                            <button
                              disabled={!canModify}
                              onClick={() => canModify && onEditUser(u)}
                              title={canModify ? "Edit Profile / Role" : "Superadmin account cannot be edited by Admin"}
                              className={`p-2 rounded-xl transition-all ${
                                canModify
                                  ? "bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
                              }`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </>
                        );
                      })()}

                      {/* Delete Button (Superadmin Only - Can delete all users including other admins) */}
                      {isSuperadmin && (
                        <button
                          onClick={() => onDeleteUser(u)}
                          disabled={isSelf}
                          title={isSelf ? 'Your active session account' : 'Delete User Account'}
                          className={`p-2 rounded-xl transition-all ${
                            isSelf
                              ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                              : 'bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer'
                          }`}
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
