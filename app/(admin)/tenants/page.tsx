'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
  Server,
  Database,
  HardDrive,
  Radio,
  Users,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { TenantTable } from '@/components/tenants/TenantTable';
import { TenantProvisioningModal } from '@/components/tenants/TenantProvisioningModal';
import { TenantEditModal } from '@/components/tenants/TenantEditModal';
import type { TenantItem } from '@/lib/tenants';
import { formatBytes } from '@/lib/tenant-utils';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Modals state
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [tenantToEdit, setTenantToEdit] = useState<TenantItem | null>(null);

  const [tenantToDelete, setTenantToDelete] = useState<TenantItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTenants = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/tenants');
      if (res.ok) {
        const json = await res.json();
        setTenants(json.tenants || []);
        setSummary(json.summary || null);
        if (isManual) {
          showToast('Tenant data and storage capacity updated successfully.');
        }
      }
    } catch (err: any) {
      console.error('Error fetching tenants:', err);
      showToast('Failed to load tenant data.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleStatusChange = async (tenantId: number, newStatus: 'ACTIVE' | 'SUSPENDED') => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to change tenant status');
      }

      showToast(`Tenant status changed successfully to ${newStatus}.`);
      fetchTenants();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteTenant = async () => {
    if (!tenantToDelete) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/tenants/${tenantToDelete.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to delete tenant');
      }

      showToast(json.message || `Tenant ${tenantToDelete.campus_name} successfully deleted.`);
      setTenantToDelete(null);
      fetchTenants();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered tenants list
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      !searchQuery.trim() ||
      t.campus_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tenant_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.database_name.toLowerCase().includes(searchQuery.toLowerCase());

    const isSuspended = t.status === 'SUSPENDED' || t.is_active === 0 || t.is_active === false;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !isSuspended) ||
      (statusFilter === 'suspended' && isSuspended);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              <span>Campus Tenant Management & Automated Provisioning</span>
            </h1>
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            New campus enrollment with automated MongoDB provisioning, Redis allocation, and storage monitoring.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTenants(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsProvisionModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Provision New Tenant</span>
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
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Tenants */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Registered Campuses</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '-' : summary?.totalTenants || tenants.length}
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold mt-1 block">
              {summary?.activeTenants ?? tenants.length} Active • {summary?.suspendedTenants ?? 0} Suspended
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: MongoDB Storage */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total MongoDB Storage</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1 font-mono">
              {loading ? '-' : formatBytes(summary?.totalStorageBytes || 0)}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">
              Data: {formatBytes(summary?.totalDataBytes || 0)}
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <HardDrive className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Redis Cache Keys */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Redis Cache Keys</span>
            <div className="text-2xl font-extrabold text-indigo-600 mt-1 font-mono">
              {loading ? '-' : `${summary?.totalRedisKeys || 0} Keys`}
            </div>
            <span className="text-[11px] text-indigo-500 font-semibold mt-1 block">Multi-Tenant L1 Cache</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
            <Radio className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Total Users */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Campus Analysts</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {loading ? '-' : summary?.totalUsers || 0}
            </div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1 block">Locked to Campus Scope</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-500/10 text-slate-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
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
            placeholder="Search campus name, code, database..."
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

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            All ({tenants.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'active'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Active ({tenants.filter((t) => t.status === 'ACTIVE' && (t.is_active === 1 || t.is_active === true)).length})
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'suspended'
                ? 'bg-white text-rose-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Suspended ({tenants.filter((t) => t.status === 'SUSPENDED' || t.is_active === 0 || t.is_active === false).length})
          </button>
        </div>
      </div>

      {/* Tenant Table */}
      <TenantTable
        tenants={filteredTenants}
        loading={loading}
        onStatusChange={handleStatusChange}
        onEditTenant={(tenant) => {
          setTenantToEdit(tenant);
          setIsEditModalOpen(true);
        }}
        onDeleteTenant={(tenant) => setTenantToDelete(tenant)}
      />

      {/* Modal: Automated Provisioning */}
      <TenantProvisioningModal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        onSuccess={() => {
          showToast('New tenant provisioned successfully (100%)!');
          fetchTenants();
        }}
      />

      {/* Modal: Edit Tenant */}
      <TenantEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          fetchTenants();
        }}
        tenant={tenantToEdit}
      />

      {/* Modal: Delete Tenant Confirmation */}
      {tenantToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Delete Campus Tenant?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {tenantToDelete.campus_name} ({tenantToDelete.tenant_code})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action will remove the campus entity from MySQL <code>tenants</code> and <code>platform_master.tenants</code>.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setTenantToDelete(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteTenant}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Tenant</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
