'use client';

import React from 'react';
import { Power } from 'lucide-react';

interface QuickStartStopBarProps {
  nodes?: Array<{
    id: string;
    name: string;
    ok: boolean;
  }>;
}

export function QuickStartStopBar({
  nodes = [],
}: QuickStartStopBarProps) {
  // 5 Services specified in Figma order: MongoDB, Redis, Indexer, Postgre, MySQL
  const serviceList = [
    { id: 'mongodb', label: 'MongoDB' },
    { id: 'redis', label: 'Redis' },
    { id: 'opensearch', label: 'Indexer' },
    { id: 'iris', label: 'Postgre' },
    { id: 'mysql', label: 'MySQL' },
  ];

  return (
    <div className="w-full bg-[#F5F5F5] border border-gray-200/70 rounded-xl p-2.5 md:p-3.5 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {serviceList.map((service) => {
          const matchedNode = nodes.find(
            (n) => n.id.toLowerCase() === service.id.toLowerCase()
          );
          // Default to true if node status is not yet loaded, or evaluate live ok status
          const isOnline = matchedNode ? matchedNode.ok : true;

          return (
            <div
              key={service.id}
              className="bg-white rounded-lg border border-gray-200/70 px-4 py-2.5 flex items-center gap-3 shadow-sm hover:shadow transition-all"
            >
              {/* Left: Power status indicator (Green if online, Red if offline) */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm flex-shrink-0 ${
                  isOnline
                    ? 'bg-[#22C55E] text-white shadow-emerald-500/20'
                    : 'bg-[#EF4444] text-white shadow-red-500/20'
                }`}
                title={isOnline ? `${service.label}: Online` : `${service.label}: Offline`}
              >
                <Power className="w-4 h-4 stroke-[2.5]" />
              </div>

              {/* Service Label in Aleo font */}
              <span className="font-aleo font-bold text-lg md:text-xl text-black truncate select-none">
                {service.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
