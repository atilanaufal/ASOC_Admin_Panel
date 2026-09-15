import React from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Database, HardDrive, Radio, Shield, Cpu, Server } from 'lucide-react';

interface NodeProps {
  node: {
    id: string;
    name: string;
    engine: string;
    port: number;
    target: string;
    database: string;
    ok: boolean;
    latencyMs: number;
    version?: string;
    error?: string;
    role: string;
  };
}

export function LiveNodeCard({ node }: NodeProps) {
  const getIcon = (id: string) => {
    switch (id) {
      case 'mysql':
        return <Database className="w-5 h-5 text-blue-500" />;
      case 'mongodb':
        return <HardDrive className="w-5 h-5 text-emerald-500" />;
      case 'redis':
        return <Radio className="w-5 h-5 text-rose-500" />;
      case 'wazuh':
        return <Shield className="w-5 h-5 text-blue-600" />;
      case 'opensearch':
        return <Cpu className="w-5 h-5 text-indigo-500" />;
      case 'iris':
        return <Server className="w-5 h-5 text-teal-500" />;
      default:
        return <Database className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-all">
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200/60 flex items-center justify-center">
              {getIcon(node.id)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {node.name}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">{node.target}</p>
            </div>
          </div>
          <StatusBadge
            status={node.ok ? 'online' : 'offline'}
            latency={node.latencyMs}
            size="sm"
          />
        </div>

        <p className="text-xs text-slate-600 line-clamp-2 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          {node.role}
        </p>
      </div>

      <div className="space-y-1.5 pt-3 border-t border-slate-100 text-[11px]">
        <div className="flex items-center justify-between text-slate-500">
          <span>Engine / Versi:</span>
          <span className="font-medium text-slate-700">
            {node.version ? `${node.engine} (${node.version})` : node.engine}
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>Database / Namespace:</span>
          <span className="font-mono text-slate-700 truncate max-w-[160px]">
            {node.database}
          </span>
        </div>
      </div>
    </div>
  );
}
