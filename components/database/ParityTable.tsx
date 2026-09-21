import React from 'react';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

interface ParityRecord {
  tenantId: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix: string;
  mongo: {
    incidents: number;
    vulnerabilities: number;
    reports: number;
    devices: number;
    totalDocs: number;
  };
  redis: {
    keyCount: number;
  };
  opensearch: {
    estimatedAlerts: number;
  };
  iris: {
    estimatedCases: number;
  };
  parityScore: number;
  status: string;
}

interface ParityTableProps {
  data: ParityRecord[];
  loading?: boolean;
}

export function ParityTable({ data, loading }: ParityTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-slate-900">
            Cross-Database Parity & Reconciliation Audit
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Comparison of MongoDB documents, Redis cache keys, and telemetry indices per tenant.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="px-5 py-3.5">Tenant</th>
              <th className="px-5 py-3.5">MongoDB Incidents</th>
              <th className="px-5 py-3.5">MongoDB Vuln</th>
              <th className="px-5 py-3.5">MongoDB Reports</th>
              <th className="px-5 py-3.5">MongoDB Devices</th>
              <th className="px-5 py-3.5">Redis Keys</th>
              <th className="px-5 py-3.5">Parity Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                  Auditing parity across databases...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                  No tenant data available for audit.
                </td>
              </tr>
            ) : (
              data.map((record) => (
                <tr
                  key={record.tenantId}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-800">
                        {record.campusName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {record.databaseName}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-700">
                    {record.mongo.incidents.toLocaleString('en-US')}
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-700">
                    {record.mongo.vulnerabilities.toLocaleString('en-US')}
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-700">
                    {record.mongo.reports.toLocaleString('en-US')}
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-700">
                    {record.mongo.devices.toLocaleString('en-US')}
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-blue-600">
                    {record.redis.keyCount.toLocaleString('en-US')} keys
                  </td>
                  <td className="px-5 py-4">
                    {record.status === 'IN_SYNC' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>In Sync ({record.parityScore}%)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        <span>Needs Sync ({record.parityScore}%)</span>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/data-sync?tenant=${record.tenantCode}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <span>Sync Data</span>
                      <RefreshCw className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
