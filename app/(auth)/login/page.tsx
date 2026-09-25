'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'session_expired') {
      setErrorMessage('Your session has expired due to 15 minutes of inactivity. Please sign in again.');
    } else if (errorParam === 'browser_closed') {
      setErrorMessage('Browser was previously closed. For security reasons, please sign in again.');
    } else if (errorParam === 'unauthorized') {
      setErrorMessage('Session expired or not logged in. Please sign in again.');
    } else if (errorParam === 'tenant_forbidden') {
      setErrorMessage('Access denied. This portal is restricted to Platform Administrators. Your account does not have sufficient privileges.');
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter username/email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Authentication failed. Please check your credentials.');
        setLoading(false);
        return;
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('asoc_browser_session', Date.now().toString());
      }
      setSuccessMessage('Sign in successful! Redirecting to dashboard...');
      setTimeout(() => {
        const from = searchParams.get('from') || '/database-status';
        router.push(from === '/' ? '/database-status' : from);
        router.refresh();
      }, 500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to connect to ASOC server.');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-xl shadow-slate-200/50">
      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div className="flex-1 font-medium">{successMessage}</div>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-5">
        {/* Username / Email */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Username / Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="superadmin"
              required
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white border border-transparent focus:border-blue-400 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-10 pr-11 py-2.5 bg-[#F0F4F8] hover:bg-[#E9EEF5] focus:bg-white border border-transparent focus:border-blue-400 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-[#0066FF] hover:bg-[#0052CC] text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-98"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Sign In to Admin Portal</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer Notice */}
      <div className="mt-6 pt-5 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-500 leading-relaxed">
          Restricted to ASOC Platform Administrator authority. Tenant analysts please access your respective tenant portals.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F4F7FA] flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Subtle Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center relative w-14 h-14 mb-3">
            <Image
              src="/infoguard.png"
              alt="InfoGuard Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-sans">
            ASOC Admin Portal
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Academic Security Operations Center Central Administration
          </p>
        </div>

        <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading form...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
