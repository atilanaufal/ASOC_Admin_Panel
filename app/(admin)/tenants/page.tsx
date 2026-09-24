'use client';

import React, { useState, useEffect } from 'react';
import {
  Building2,
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

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('admin');

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

  useEffect(() => {
    try {
      const cookies = document.cookie.split(';');
      for (const c of cookies) {
        const [k, v] = c.trim().split('=');
        if (k === 'auth_session' && v) {
          const parsed = JSON.parse(decodeURIComponent(v));
          if (parsed?.role) {
            setCurrentUserRole(parsed.role);
            return;
          }
        }
      }
    } catch {}

    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role) setCurrentUserRole(d.user.role);
      })
      .catch(() => {});
  }, []);

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
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Update Status
  const handleStatusChange = async (tenantId: number, newStatus: 'ACTIVE' | 'SUSPENDED') => {
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to update tenant status');
      }
      showToast(`Tenant status updated to ${newStatus}.`);
      fetchTenants();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Delete Tenant
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
      showToast(`Tenant ${tenantToDelete.campus_name} deleted successfully.`);
      setTenantToDelete(null);
      fetchTenants();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      t.campus_name.toLowerCase().includes(q) ||
      t.tenant_code.toLowerCase().includes(q) ||
      t.database_name.toLowerCase().includes(q);

    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && t.is_active === 1) ||
      (statusFilter === 'suspended' && t.is_active === 0);

    return matchQuery && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Top Bar matching Figma */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight font-sans">
            Tenant Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage multi-tenant campuses, MongoDB database mapping, and access isolation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchTenants(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200/60 shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00BCD4]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsProvisionModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00BCD4] hover:bg-[#00ACC1] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
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
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Clean KPI Card (Total Tenants Only - Removed Total Agents Widget) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Total Tenants
          </span>
          <div className="my-2 flex items-center justify-between">
            <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {loading ? '...' : (summary?.totalTenants || tenants.length)}
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-[11px] font-semibold text-slate-500">
            Active Multi-Tenant Organizations
          </div>
        </div>
      </div>

      {/* Morphism Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/60 p-3.5 shadow-xs flex items-center justify-between gap-3">
        {/* Full-width Pill Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tenant name, code, database..."
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
      </div>

      {/* Tenant Table */}
      <TenantTable
        tenants={filteredTenants}
        loading={loading}
        currentUserRole={currentUserRole}
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
                  Delete Tenant?
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {tenantToDelete.campus_name} ({tenantToDelete.tenant_code})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action will permanently delete the tenant database from MongoDB, purge all Redis keys, and remove registry records from MySQL.
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
