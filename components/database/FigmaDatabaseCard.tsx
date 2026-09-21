'use client';

import React from 'react';
import Image from 'next/image';

export interface DatabaseNodeInfo {
  id: string;
  name: string;
  port: number;
  role: string;
  ok: boolean;
  latencyMs?: number;
  uptime?: string;
  startedAt?: string;
  lastSeen?: string;
  logoSrc?: string;
}

interface FigmaDatabaseCardProps {
  node: DatabaseNodeInfo;
}

export function FigmaDatabaseCard({ node }: FigmaDatabaseCardProps) {
  const getLogo = (id: string, fallbackLogo?: string) => {
    if (fallbackLogo) return fallbackLogo;
    switch (id.toLowerCase()) {
      case 'mysql':
        return '/mysql.png';
      case 'mongodb':
        return '/mongodb.png';
      case 'redis':
        return '/redis.png';
      case 'opensearch':
      case 'indexer':
        return '/indexer.png';
      case 'iris':
      case 'postgre':
        return '/postgre.png';
      case 'wazuh':
      case 'wazuh manager':
        return '/redis.png';
      default:
        return '/asocLogo.png';
    }
  };

  const isOnline = node.ok;
  const uptimeText = node.uptime || '30D 2H 20M';
  const startedAtText = node.startedAt || '03 March 2026 | 22:00';
  const lastSeenText =
    node.lastSeen || (isOnline ? 'Online' : 'Disconnected');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between">
      {/* Top: Logo, Name, Port & Online/Offline */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative w-11 h-11 flex-shrink-0">
              <Image
                src={getLogo(node.id, node.logoSrc)}
                alt={`${node.name} logo`}
                fill
                className="object-contain"
                priority
              />
            </div>

            <div className="min-w-0">
              <h3 className="font-extrabold text-lg md:text-xl text-slate-900 truncate leading-tight">
                {node.name}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Port {node.port}
              </p>
            </div>
          </div>

          <div className="flex-shrink-0">
            <span
              className={`text-sm font-bold ${
                isOnline ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Function Banner Box */}
        <div className="bg-[#F8FAFC] rounded-xl px-4 py-2.5 my-4 border border-slate-100 text-center">
          <p className="text-xs font-semibold text-slate-700 truncate">
            {node.role}
          </p>
        </div>
      </div>

      {/* Bottom Metadata Rows matching Figma */}
      <div className="space-y-1.5 pt-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-600 font-medium">Started At :</span>
          <span className="text-slate-900 font-semibold">{startedAtText}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 font-medium">Uptime :</span>
          <span className="text-slate-900 font-semibold">{uptimeText}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600 font-medium">Last Seen :</span>
          <span
            className={`font-semibold ${
              isOnline ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {lastSeenText}
          </span>
        </div>
      </div>
    </div>
  );
}
