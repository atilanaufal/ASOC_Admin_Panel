'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Terminal,
  Building2,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

interface TenantOption {
  id: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
}

interface EnrollmentScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: TenantOption[];
  defaultTenantCode?: string;
}

export function EnrollmentScriptModal({
  isOpen,
  onClose,
  tenants,
  defaultTenantCode = 'UI',
}: EnrollmentScriptModalProps) {
  const [selectedTenant, setSelectedTenant] = useState(defaultTenantCode);
  const [selectedOs, setSelectedOs] = useState<'linux-deb' | 'linux-rpm' | 'windows'>('linux-deb');
  const [scriptData, setScriptData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (defaultTenantCode) setSelectedTenant(defaultTenantCode);
      fetchEnrollmentScript();
    }
  }, [isOpen, selectedTenant, selectedOs]);

  if (!isOpen) return null;

  const fetchEnrollmentScript = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/wazuh/enrollment-script?tenantCode=${selectedTenant}&os=${selectedOs}`
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memuat skrip pendaftaran');
      }
      setScriptData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!scriptData?.command) return;
    navigator.clipboard.writeText(scriptData.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Generator Skrip Pendaftaran Agen Wazuh
              </h3>
              <p className="text-xs text-slate-500">
                Instalasi satu baris (one-liner) otomatis terikat ke grup database kampus target
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Configuration Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Campus Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                <span>Select Campus / Tenant Target</span>
              </label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.tenantCode}>
                    {t.campusName} ({t.tenantCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Group Info */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Grup Wazuh & Database Terikat</span>
              </label>
              <div className="px-3.5 py-2.5 bg-slate-100 rounded-xl border border-slate-200 font-mono text-xs font-bold text-blue-600 truncate">
                {scriptData?.targetGroup || 'universitas_indonesia'}
              </div>
            </div>
          </div>

          {/* OS Selector Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Pilih Sistem Operasi Endpoint
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedOs('linux-deb')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  selectedOs === 'linux-deb'
                    ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>Ubuntu / Debian</span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">.deb installer</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOs('linux-rpm')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  selectedOs === 'linux-rpm'
                    ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>RHEL / CentOS</span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">.rpm installer</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOs('windows')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-1 ${
                  selectedOs === 'windows'
                    ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>Windows Server</span>
                <span className="text-[10px] font-mono text-slate-400 font-normal">PowerShell MSI</span>
              </button>
            </div>
          </div>

          {/* Terminal Command Display */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-500" />
                <span>Perintah Eksekusi Terminal (One-Liner Command)</span>
              </span>
              <button
                type="button"
                onClick={copyToClipboard}
                disabled={loading || !scriptData?.command}
                className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin Perintah'}</span>
              </button>
            </div>

            <div className="relative rounded-2xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner group">
              {loading ? (
                <div className="py-4 text-center text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat skrip instalasi...</span>
                </div>
              ) : (
                <code className="block leading-relaxed break-all select-all">
                  {scriptData?.command}
                </code>
              )}
            </div>

            {scriptData?.instructions && (
              <p className="text-[11px] text-slate-500">
                💡 <span className="font-semibold">Petunjuk:</span> {scriptData.instructions}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50/50">
          <div className="text-[11px] text-slate-400">
            Target Wazuh Manager: <span className="font-mono font-bold text-blue-500">{scriptData?.wazuhManager ? `${scriptData.wazuhManager}:55000` : 'Active Manager'}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={copyToClipboard}
              disabled={loading || !scriptData?.command}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin & Jalankan'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
