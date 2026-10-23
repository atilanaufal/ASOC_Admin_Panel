'use client';

import React, { useState } from 'react';
import {
  X,
  Building2,
  Database,
  Server,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';
import { slugifyCampusName } from '@/lib/tenant-utils';

interface TenantProvisioningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TenantProvisioningModal({
  isOpen,
  onClose,
  onSuccess,
}: TenantProvisioningModalProps) {
  const [tenantCode, setTenantCode] = useState('');
  const [tenantName, setTenantName] = useState('');

  // Stepper & Status
  const [step, setStep] = useState<'form' | 'provisioning' | 'success'>('form');
  const [provisioningStepIndex, setProvisioningStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  if (!isOpen) return null;

  const slug = slugifyCampusName(tenantName || '');
  const databaseName = slug || 'tenant_db_auto';
  const redisPrefix = slug ? `${slug}:` : 'prefix_auto:';

  const handleStartProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantCode.trim() || !tenantName.trim()) {
      setError('Tenant Code and Tenant Name are required.');
      return;
    }

    setError(null);
    setStep('provisioning');
    setProvisioningStepIndex(1);

    try {
      const stepTimer1 = setTimeout(() => setProvisioningStepIndex(2), 500);
      const stepTimer2 = setTimeout(() => setProvisioningStepIndex(3), 1100);
      const stepTimer3 = setTimeout(() => setProvisioningStepIndex(4), 1800);

      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: tenantCode.trim().toUpperCase(),
          campusName: tenantName.trim(),
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to process automated provisioning');
      }

      setProvisioningStepIndex(5);
      setSuccessData(json.tenant);
      setStep('success');
      onSuccess();
    } catch (err: any) {
      setError(err.message);
      setStep('form');
    }
  };

  const handleClose = () => {
    setTenantCode('');
    setTenantName('');
    setStep('form');
    setError(null);
    setSuccessData(null);
    onClose();
  };

  const provisioningSteps = [
    { title: 'MySQL Auth DB Enrollment', desc: 'Registering tenant code, metadata, & prefixes' },
    { title: 'MongoDB Multi-Tenant Database', desc: `Initializing ${databaseName} & physical collections` },
    { title: 'Composite Indexes Creation', desc: 'Building compound index for timestamp & severity' },
    { title: 'Redis Cache Namespace Ready', desc: `Allocating key hash pattern ${redisPrefix}*` },
    { title: 'Pipeline Operational Verification', desc: 'Sync pipelines and health checks verified' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Automated Tenant Provisioning
              </h3>
              <p className="text-xs text-slate-500">
                Automated provisioning of tenant database and Redis cache namespace
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 'form' && (
            <form onSubmit={handleStartProvisioning} className="space-y-4">
              {/* Tenant Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tenant Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="e.g. TNTA"
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Tenant Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="e.g. Tenant Organization Alpha"
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Automated Database Spec Preview */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3 text-blue-500" />
                  <span>Automated Spec (Zero-Config)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60">
                    <span className="text-slate-400">MongoDB:</span>
                    <span className="font-bold text-blue-600 truncate max-w-[130px]">{databaseName}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60">
                    <span className="text-slate-400">Redis Prefix:</span>
                    <span className="font-bold text-indigo-600 truncate max-w-[130px]">{redisPrefix}</span>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
                >
                  <Server className="w-4 h-4" />
                  <span>Start Automated Provisioning</span>
                </button>
              </div>
            </form>
          )}

          {step === 'provisioning' && (
            <div className="py-6 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <h4 className="font-extrabold text-base text-slate-900">
                  Executing Automated Provisioning...
                </h4>
                <p className="text-xs text-slate-500">
                  Creating MongoDB physical database, collections, composite indexes, and Redis allocation.
                </p>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                {provisioningSteps.map((s, idx) => {
                  const isDone = provisioningStepIndex > idx + 1;
                  const isCurrent = provisioningStepIndex === idx + 1;

                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {isDone ? (
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 flex items-center justify-center font-bold text-xs">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : isCurrent ? (
                          <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center font-bold text-xs">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-xs font-bold ${
                            isDone
                              ? 'text-emerald-600'
                              : isCurrent
                              ? 'text-blue-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {s.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{s.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'success' && successData && (
            <div className="py-4 space-y-5 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-extrabold text-base text-slate-900">
                  Tenant Successfully Provisioned!
                </h4>
                <p className="text-xs text-slate-500">
                  Database and access pipelines are active and ready for data ingest.
                </p>
              </div>

              {/* Summary details card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-400">Tenant:</span>
                  <span className="font-bold text-slate-900">{successData.campusName} ({successData.tenantCode})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-400">MongoDB:</span>
                  <span className="font-bold text-blue-600">{successData.databaseName}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Redis Prefix:</span>
                  <span className="font-bold text-indigo-600">{successData.redisPrefix}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
