'use client';

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  RefreshCw,
  Search,
  Building2,
  Shield,
  ShieldAlert,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { UserTable } from '@/components/users/UserTable';
import { UserModal } from '@/components/users/UserModal';
import { ResetPasswordModal } from '@/components/users/ResetPasswordModal';
import type { UserItem } from '@/lib/users';
import { MorphismSummary } from '@/components/ui/MorphismSummary';
import CustomSelect from '@/components/ui/CustomSelect';

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<UserItem | null>(null);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [userToReset, setUserToReset] = useState<UserItem | null>(null);

  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [currentUserRole, setCurrentUserRole] = useState<string>('admin');
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    try {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const [k, v] = c.trim().split('=');
        if ((k === 'asoc_admin_session' || k === 'auth_session') && v) {
          const parsed = JSON.parse(decodeURIComponent(v));
          if (parsed?.role) setCurrentUserRole(parsed.role);
          if (parsed?.username) setCurrentUsername(parsed.username);
          return;
        }
      }
    } catch {}

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role) setCurrentUserRole(d.user.role);
        if (d?.user?.username) setCurrentUsername(d.user.username);
      })
      .catch(() => {});
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (selectedTenant !== 'all') params.set('tenant', selectedTenant);
      if (selectedRole !== 'all') params.set('role', selectedRole);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setUsers(json.users || []);
        if (isManual) {
          showToast('User list updated successfully.');
        }
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      showToast('Failed to load user list.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const json = await res.json();
        setTenants(json.tenants || []);
      }
    } catch (err) {
      console.error('Error fetching tenants for user filter:', err);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [selectedTenant, selectedRole, searchQuery]);

  // Handlers
  const handleOpenCreateModal = () => {
    setUserToEdit(null);
    setIsUserModalOpen(true);
  };

  const handleOpenEditModal = (user: UserItem) => {
    setUserToEdit(user);
    setIsUserModalOpen(true);
  };

  const handleOpenResetModal = (user: UserItem) => {
    setUserToReset(user);
    setIsResetModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete user');
      }

      showToast(json.message || `User @${userToDelete.username} successfully deleted.`);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // KPI calculations
  const totalUsers = users.length;
  const superadminCount = users.filter((u) => u.role === 'superadmin').length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const tenantAnalystCount = users.filter((u) => u.role !== 'superadmin' && u.role !== 'admin').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Morphism Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-800">
            User Accounts & Access Control (RBAC)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Role-Based Access Control, multi-tenant analysts, and security credential management.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/60 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00BCD4]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00BCD4] hover:bg-[#00ACC1] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New User</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Variative KPI Cards (Clean Morphism Style, No Donut) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Total Users
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : totalUsers}
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Superadmin
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-amber-700 tracking-tight">
              {loading ? '...' : superadminCount}
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Platform Admins
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-indigo-600 tracking-tight">
              {loading ? '...' : adminCount}
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
          </div>

        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Tenant Analysts
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : tenantAnalystCount}
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

        </div>
      </div>

      {/* Morphism Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Full-width Pill Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search username, email, tenant..."
            className="w-full pl-10 pr-8 py-2.5 bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none border border-transparent focus:border-[#00BCD4] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Tenant Filter */}
          <CustomSelect
            value={selectedTenant}
            onChange={(val) => setSelectedTenant(String(val))}
            options={[
              { value: 'all', label: 'All Tenants' },
              ...tenants.map((t) => ({
                value: t.tenant_code,
                label: `${t.campus_name} (${t.tenant_code})`,
              })),
            ]}
            icon={<Building2 className="w-3.5 h-3.5 text-[#00BCD4]" />}
            className="w-full sm:w-52"
            buttonClassName="w-full sm:w-52"
          />

          {/* Role Filter */}
          <CustomSelect
            value={selectedRole}
            onChange={(val) => setSelectedRole(String(val))}
            options={[
              { value: 'all', label: 'All Roles' },
              { value: 'superadmin', label: 'Superadmin' },
              { value: 'admin', label: 'Admin' },
              { value: 'tenant', label: 'Analyst' },
            ]}
            icon={<Shield className="w-3.5 h-3.5 text-indigo-500" />}
            className="w-full sm:w-48"
            buttonClassName="w-full sm:w-48"
          />
        </div>
      </div>

      {/* Interactive User Table */}
      <UserTable
        users={users}
        loading={loading}
        currentUserRole={currentUserRole}
        currentUsername={currentUsername}
        onResetPassword={handleOpenResetModal}
        onEditUser={handleOpenEditModal}
        onDeleteUser={(user) => setUserToDelete(user)}
      />

      {/* Modal: Create / Edit User */}
      <UserModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSuccess={() => {
          showToast(
            userToEdit
              ? `Profile for user @${userToEdit.username} updated successfully.`
              : 'New user created successfully and synchronized with Better-Auth.'
          );
          fetchUsers();
        }}
        userToEdit={userToEdit}
        tenants={tenants}
        currentUserRole={currentUserRole}
      />

      {/* Modal: Reset Password */}
      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchUsers();
        }}
        user={userToReset}
      />

      {/* Modal: Delete Confirmation */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Delete User?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  User: @{userToDelete.username}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action will permanently delete the account from MySQL <code>auth_db.users</code>, remove Better-Auth identity, and immediately revoke all active sessions.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteUser}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete & Revoke Sessions</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
