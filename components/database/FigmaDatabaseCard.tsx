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
  // Mapping logos according to Figma design
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
        return '/postgre.png';
      default:
        return '/asocLogo.png';
    }
  };

  const isOnline = node.ok;
  const uptimeText = node.uptime || '30D 2H 20M';
  const startedAtText = node.startedAt || '03 March 2026 | 22:00';
  const lastSeenText = node.lastSeen || (isOnline ? `${node.latencyMs ? `${node.latencyMs}ms ago` : '10 Seconds Ago'}` : 'Disconnected');

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-5 md:p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      {/* Top Header Section: Logo, Title, Port & Online/Offline Status */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Logo Image */}
            <div className="relative w-12 h-12 md:w-[50px] md:h-[50px] flex-shrink-0">
              <Image
                src={getLogo(node.id, node.logoSrc)}
                alt={`${node.name} logo`}
                fill
                className="object-contain"
                priority
              />
            </div>

            {/* Name & Port */}
            <div className="min-w-0">
              <h3 className="font-aleo font-bold text-xl md:text-2xl text-black truncate leading-tight">
                {node.name}
              </h3>
              <p className="font-aleo text-sm md:text-base text-black font-medium mt-0.5">
                Port {node.port}
              </p>
            </div>
          </div>

          {/* Online / Offline Status */}
          <div className="flex-shrink-0">
            <span
              className={`font-aleo font-bold text-base md:text-lg ${
                isOnline ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Middle Role / Function Banner */}
        <div className="bg-[#F4F6F8] rounded-md px-3.5 py-2.5 my-4 border border-gray-100">
          <p className="font-aleo text-sm md:text-base text-black font-medium truncate">
            {node.role}
          </p>
        </div>
      </div>

      {/* Bottom Details Section with 3 rows */}
      <div className="border-t border-gray-200/80 pt-3.5 space-y-1.5">
        {/* Row 1: Uptime */}
        <div className="flex items-center justify-between text-sm md:text-base font-aleo">
          <span className="text-black font-medium">Uptime :</span>
          <span className="text-black font-medium">{uptimeText}</span>
        </div>

        {/* Row 2: Started At */}
        <div className="flex items-center justify-between text-sm md:text-base font-aleo">
          <span className="text-black font-medium">Started At :</span>
          <span className="text-black font-medium">{startedAtText}</span>
        </div>

        {/* Row 3: Last Seen */}
        <div className="flex items-center justify-between text-sm md:text-base font-aleo">
          <span className="text-black font-medium">Last Seen :</span>
          <span className="text-black font-medium">{lastSeenText}</span>
        </div>
      </div>
    </div>
  );
}
