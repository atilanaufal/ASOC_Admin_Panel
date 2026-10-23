'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { TenantItem } from '@/lib/tenants';

interface TenantStatusToggleProps {
  tenant: TenantItem;
  onStatusChange: (tenantId: number, newStatus: 'ACTIVE' | 'SUSPENDED') => Promise<void>;
}

export function TenantStatusToggle({ tenant, onStatusChange }: TenantStatusToggleProps) {
  const isActive = tenant.status === 'ACTIVE' && (tenant.is_active === 1 || tenant.is_active === true);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleToggleClick = () => {
    if (isActive) {
      // If active, ask confirmation to suspend
      setConfirmOpen(true);
    } else {
      // If suspended, activate immediately
      executeStatusChange('ACTIVE');
    }
  };

  const executeStatusChange = async (newStatus: 'ACTIVE' | 'SUSPENDED') => {
    setLoading(true);
    try {
      await onStatusChange(tenant.id, newStatus);
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleClick}
          disabled={loading}
          title={isActive ? 'Click to suspend' : 'Click to reactivate'}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isActive ? 'bg-emerald-500' : 'bg-slate-300'
          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
              isActive ? 'translate-x-5' : 'translate-x-0'
            }`}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />
            ) : isActive ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-slate-400" />
            )}
          </span>
        </button>

        <span
          className={`text-[11px] font-extrabold ${
            isActive
              ? 'text-emerald-600'
              : 'text-rose-600'
          }`}
        >
          {isActive ? 'ACTIVE' : 'SUSPENDED'}
        </span>
      </div>

      {/* Confirmation Modal when suspending */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Suspend Tenant Access?
                </h3>
                <p className="text-xs text-slate-500">
                  {tenant.campus_name} ({tenant.tenant_code})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Disabling this tenant will block login access for all analyst users of this tenant to their tenant dashboard. Data in MongoDB and Redis remains safe and will not be deleted.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => executeStatusChange('SUSPENDED')}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Suspend Tenant</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
