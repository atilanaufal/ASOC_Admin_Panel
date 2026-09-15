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

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
  const superadminCount = users.filter((u) => u.role === 'superadmin' || u.role === 'admin').length;
  const tenantAnalystCount = users.filter((u) => u.role !== 'superadmin' && u.role !== 'admin').length;
  const uniqueCampusesCount = new Set(
    users.filter((u) => u.tenant_code && u.role !== 'superadmin').map((u) => u.tenant_code)
  ).size;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-600" />
              <span>User Management & Access Control (RBAC)</span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            Manage Superadmin and Multi-Tenant Campus Analyst accounts, instant password resets, and centralized access control.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchUsers(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
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
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-700'
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

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Users */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Users</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '-' : totalUsers}
            </div>
            <span className="text-[11px] text-blue-500 font-semibold mt-1 block">MySQL Synchronized</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Superadmins */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Global Superadmins</span>
            <div className="text-2xl font-extrabold text-indigo-600 mt-1">
              {loading ? '-' : superadminCount}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Full Portal Access</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Tenant Analysts */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Campus Analysts</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">
              {loading ? '-' : tenantAnalystCount}
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold mt-1 block">Locked to Campus Scope</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Campuses with Users */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Registered Campuses</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '-' : uniqueCampusesCount}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Out of {tenants.length} Total Campuses</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search username, email, campus..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Tenant Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer text-xs"
            >
              <option value="all">All Campuses</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.tenant_code}>
                  {t.campus_name} ({t.tenant_code})
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <Shield className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer text-xs"
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="tenant_admin">Tenant Admin</option>
              <option value="tenant">Campus Analysts</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interactive User Table */}
      <UserTable
        users={users}
        loading={loading}
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
