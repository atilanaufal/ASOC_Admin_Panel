'use client';

import React, { useState } from 'react';
import {
  X,
  Building2,
  Database,
  Layers,
  Server,
  UserCheck,
  Shield,
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
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
  const [campusName, setCampusName] = useState('');
  const [picName, setPicName] = useState('');
  const [picEmail, setPicEmail] = useState('');
  const [picPhone, setPicPhone] = useState('+62-');

  // Initial Admin Option
  const [createInitialAdmin, setCreateInitialAdmin] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  // Stepper & Status
  const [step, setStep] = useState<'form' | 'provisioning' | 'success'>('form');
  const [provisioningStepIndex, setProvisioningStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);

  if (!isOpen) return null;

  const slug = slugifyCampusName(campusName || '');
  const databaseName = slug || 'nama_database_otomatis';
  const redisPrefix = slug ? `${slug}:` : 'prefix_otomatis:';
  const suggestedAdminUsername = tenantCode ? `admin_${tenantCode.toLowerCase()}` : 'admin_kampus';

  const generateAdminPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let generated = '';
    for (let i = 0; i < 14; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setAdminPassword(generated);
    setShowPassword(true);
  };

  const copyCredentials = () => {
    const text = `Kampus: ${campusName} (${tenantCode})\nDatabase: ${databaseName}\nUsername: ${suggestedAdminUsername}\nPassword: ${adminPassword}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleStartProvisioning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantCode.trim() || !campusName.trim()) {
      setError('Kode Kampus dan Nama Kampus wajib diisi.');
      return;
    }

    if (createInitialAdmin && !adminPassword) {
      setError('Silakan tentukan atau generate password untuk Campus Admin.');
      return;
    }

    setError(null);
    setStep('provisioning');
    setProvisioningStepIndex(1);

    try {
      // Step simulation for visual UI feedback while waiting for API
      const stepTimer1 = setTimeout(() => setProvisioningStepIndex(2), 500);
      const stepTimer2 = setTimeout(() => setProvisioningStepIndex(3), 1100);
      const stepTimer3 = setTimeout(() => setProvisioningStepIndex(4), 1800);

      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantCode: tenantCode.trim().toUpperCase(),
          campusName: campusName.trim(),
          picName: picName.trim() || undefined,
          picEmail: picEmail.trim() || undefined,
          picPhone: picPhone.trim() || undefined,
          createInitialAdmin,
          adminPassword,
        }),
      });

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(stepTimer3);

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses automated provisioning');
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
    setStep('form');
    setTenantCode('');
    setCampusName('');
    setPicName('');
    setPicEmail('');
    setPicPhone('+62-');
    setAdminPassword('');
    setError(null);
    setSuccessData(null);
    onClose();
  };

  const provisioningSteps = [
    { title: 'Validasi & Registrasi MySQL auth_db', desc: 'Menyimpan konfigurasi tenant' },
    { title: 'Registrasi Master Metadata Mongo', desc: 'Mendaftarkan contact PIC di platform_master' },
    { title: 'Pembuatan Database Fisik & 5 Indeks', desc: 'incident, vuln, devices, summary, reports' },
    { title: 'Allocated Redis Cache Namespace', desc: `Inisialisasi key ${redisPrefix}devices:summary` },
    { title: 'Pembuatan Akun Default Campus Admin', desc: `Akun @${suggestedAdminUsername} siap digunakan` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Automated Tenant Provisioning
              </h3>
              <p className="text-xs text-slate-500">
                Pendaftaran kampus baru dengan otomatisasi 100% database MongoDB & Redis
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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
              {/* Campus Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kode Kampus <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="misal: UB"
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name Kampus <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={campusName}
                    onChange={(e) => setCampusName(e.target.value)}
                    placeholder="misal: Universitas Brawijaya"
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Automated Database Spec Preview */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Database className="w-3 h-3 text-blue-500" />
                  <span>Otomatisasi Provisioning Spec (Zero-Config)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60">
                    <span className="text-slate-400">Mongo DB:</span>
                    <span className="font-bold text-blue-600 truncate max-w-[130px]">{databaseName}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60">
                    <span className="text-slate-400">Redis Prefix:</span>
                    <span className="font-bold text-indigo-600 truncate max-w-[130px]">{redisPrefix}</span>
                  </div>
                </div>
              </div>

              {/* PIC Contact Details */}
              <div className="space-y-3 pt-1">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-blue-500" />
                  <span>Kontak Penanggung Jawab (PIC SOC Kampus)</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      value={picName}
                      onChange={(e) => setPicName(e.target.value)}
                      placeholder="Nama PIC"
                      className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      value={picEmail}
                      onChange={(e) => setPicEmail(e.target.value)}
                      placeholder="Email PIC (soc@...)"
                      className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={picPhone}
                      onChange={(e) => setPicPhone(e.target.value)}
                      placeholder="No. Telepon / WA"
                      className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Create Initial Admin Checkbox */}
              <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createInitialAdmin}
                    onChange={(e) => setCreateInitialAdmin(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 rounded-md cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Sekaligus Buat Akun Campus Admin Default (@{suggestedAdminUsername})
                  </span>
                </label>

                {createInitialAdmin && (
                  <div className="pt-2 border-t border-blue-200/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-semibold">
                        Password Campus Admin:
                      </span>
                      <button
                        type="button"
                        onClick={generateAdminPassword}
                        className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        <span>Generate Acak</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={createInitialAdmin}
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Tentukan password admin"
                        className="w-full px-3 py-2 pr-10 bg-white rounded-xl border border-slate-200 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
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
                  <span>Mulai Otomatisasi Provisi</span>
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
                  Mengeksekusi Automated Provisioning...
                </h4>
                <p className="text-xs text-slate-500">
                  Membuat database fisik MongoDB, koleksi, indeks komposit, dan alokasi Redis.
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
                  Tenant Berhasil Diprovisi 100%!
                </h4>
                <p className="text-xs text-slate-500">
                  Database dan alur akses telah aktif dan siap menerima data ingest.
                </p>
              </div>

              {/* Summary details card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-400">Kampus:</span>
                  <span className="font-bold text-slate-900">{successData.campusName} ({successData.tenantCode})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-400">MongoDB:</span>
                  <span className="font-bold text-blue-600">{successData.databaseName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-400">Redis Prefix:</span>
                  <span className="font-bold text-indigo-600">{successData.redisPrefix}</span>
                </div>
                {successData.initialAdminCreated && (
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Admin Login:</span>
                    <span className="font-bold text-emerald-600">@{successData.adminUsername}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {successData.initialAdminCreated && (
                  <button
                    type="button"
                    onClick={copyCredentials}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Tersalin!' : 'Salin Detail'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
