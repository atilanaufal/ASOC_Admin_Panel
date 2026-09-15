'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Database,
  ShieldCheck,
  Server,
  Cpu,
  RefreshCw,
  Trash2,
  Gauge,
  Users,
  Building2,
  ShieldAlert,
  FolderTree,
  Play,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  category: string;
}

const NAV_ITEMS: NavItem[] = [
  // MONITORING
  {
    label: 'Overview',
    href: '/',
    icon: <LayoutDashboard className="w-5 h-5" />,
    category: 'MONITORING',
  },
  {
    label: 'Database Status',
    href: '/database-status',
    icon: <Database className="w-5 h-5" />,
    category: 'MONITORING',
  },
  {
    label: 'Agent Status',
    href: '/agent-status',
    icon: <ShieldCheck className="w-5 h-5" />,
    category: 'MONITORING',
  },
  {
    label: 'Service Status',
    href: '/service-monitor',
    icon: <Server className="w-5 h-5" />,
    category: 'MONITORING',
  },
  {
    label: 'Resources Usage',
    href: '/resource-usage',
    icon: <Cpu className="w-5 h-5" />,
    category: 'MONITORING',
  },

  // SYSTEM MAINTENANCE
  {
    label: 'Check & Sync',
    href: '/data-sync',
    icon: <RefreshCw className="w-5 h-5" />,
    category: 'SYSTEM MAINTENANCE',
  },
  {
    label: 'Data Retention',
    href: '/data-retention',
    icon: <Trash2 className="w-5 h-5" />,
    category: 'SYSTEM MAINTENANCE',
  },

  // USER AUTHENTICATION
  {
    label: 'User Management',
    href: '/users',
    icon: <Users className="w-5 h-5" />,
    category: 'USER AUTHENTICATION',
  },
  {
    label: 'Tenant Management',
    href: '/tenants',
    icon: <Building2 className="w-5 h-5" />,
    category: 'USER AUTHENTICATION',
  },

  // TENANT MAPPING
  {
    label: 'Wazuh Group',
    href: '/wazuh-group',
    icon: <ShieldAlert className="w-5 h-5" />,
    category: 'TENANT MAPPING',
  },
  {
    label: 'IRIS Customer',
    href: '/iris-customer',
    icon: <FolderTree className="w-5 h-5" />,
    category: 'TENANT MAPPING',
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();

  // Get distinct categories in order matching Figma
  const categories = ['MONITORING', 'SYSTEM MAINTENANCE', 'USER AUTHENTICATION', 'TENANT MAPPING'];

  return (
    <aside
      className={clsx(
        'h-[calc(100vh-3.5rem)] bg-[#002473] text-white flex flex-col flex-shrink-0 transition-all duration-300 z-20 sticky top-14 border-r border-[#001D5C] select-none',
        collapsed ? 'w-20' : 'w-64 lg:w-72'
      )}
    >
      {/* Navigation Groups List */}
      <div className="flex-1 overflow-y-auto pt-4 pb-6 px-3 space-y-4 custom-scrollbar">
        {categories.map((category) => {
          const items = NAV_ITEMS.filter((i) => i.category === category);
          return (
            <div key={category} className="space-y-1">
              {!collapsed ? (
                <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-white/70 mb-1.5">
                  {category}
                </p>
              ) : (
                <div className="w-5 h-0.5 bg-white/20 mx-auto my-2 rounded" />
              )}

              {items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={`${category}-${item.label}-${item.href}`}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      'flex items-center rounded-lg font-semibold transition-all group relative',
                      collapsed
                        ? 'justify-center p-2.5'
                        : 'px-3 py-2.5 gap-3 text-sm',
                      isActive
                        ? 'bg-[#0037B0] text-white'
                        : 'text-white/85 hover:text-white hover:bg-white/10'
                    )}
                  >
                    <span
                      className={clsx(
                        'flex-shrink-0 transition-transform group-hover:scale-105',
                        isActive ? 'text-white' : 'text-white/80 group-hover:text-white'
                      )}
                    >
                      {item.icon}
                    </span>

                    {!collapsed && (
                      <span className="flex-1 truncate tracking-tight">{item.label}</span>
                    )}

                    {/* Active Right Triangle Indicator matching Figma */}
                    {isActive && !collapsed && (
                      <Play className="w-3 h-3 fill-white text-white rotate-0 flex-shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}



