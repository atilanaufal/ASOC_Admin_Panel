'use client';

import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';

interface UnassignedAgentAlertProps {
  unassignedCount: number;
  onFilterUnassigned: () => void;
}

export function UnassignedAgentAlert({
  unassignedCount,
  onFilterUnassigned,
}: UnassignedAgentAlertProps) {
  if (unassignedCount <= 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-extrabold text-sm text-amber-900 flex items-center gap-2">
            <span>Ditemukan {unassignedCount} Agen Wazuh Belum Dipetakan!</span>
          </h4>
          <p className="text-xs text-amber-700/90 mt-0.5">
            Terdapat agen aktif yang belum terikat pada database kampus manapun. Petakan agen ke kampus target agar alert keamanan dan telemetri perangkat tersinkronkan ke dashboard tenant.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onFilterUnassigned}
        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md shadow-amber-600/20 transition-all cursor-pointer flex-shrink-0"
      >
        <span>Lihat Agen Unassigned</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
