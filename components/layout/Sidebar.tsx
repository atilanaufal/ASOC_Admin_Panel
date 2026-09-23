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
  Clock,
  Users,
  Building2,
  ShieldAlert,
  FolderTree,
  ChevronRight,
  Layers,
  PieChart,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  category: string;
}

const NAV_ITEMS: NavItem[] = [
  // System Monitoring
  {
    label: 'Database Status',
    href: '/database-status',
    icon: <Database className="w-[18px] h-[18px]" />,
    category: 'System Monitoring',
  },
  {
    label: 'Agent Status',
    href: '/agent-status',
    icon: <ShieldCheck className="w-[18px] h-[18px]" />,
    category: 'System Monitoring',
  },
  {
    label: 'Resources Usage',
    href: '/resource-usage',
    icon: <Cpu className="w-[18px] h-[18px]" />,
    category: 'System Monitoring',
  },

  // System Maintenance
  {
    label: 'Check & Sync',
    href: '/data-sync',
    icon: <Layers className="w-[18px] h-[18px]" />,
    category: 'System Maintenance',
  },
  {
    label: 'Data Retention',
    href: '/data-retention',
    icon: <PieChart className="w-[18px] h-[18px]" />,
    category: 'System Maintenance',
  },

  // User Authentication
  {
    label: 'User Management',
    href: '/users',
    icon: <Users className="w-[18px] h-[18px]" />,
    category: 'User Authentication',
  },
  {
    label: 'Tenant Management',
    href: '/tenants',
    icon: <Building2 className="w-[18px] h-[18px]" />,
    category: 'User Authentication',
  },

  // Data Mapping
  {
    label: 'Wazuh Group Mapping',
    href: '/wazuh-group',
    icon: <ShieldAlert className="w-[18px] h-[18px]" />,
    category: 'Data Mapping',
  },
  {
    label: 'IRIS Customer Mapping',
    href: '/iris-customer',
    icon: <FolderTree className="w-[18px] h-[18px]" />,
    category: 'Data Mapping',
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();

  const categories = [
    'System Monitoring',
    'System Maintenance',
    'User Authentication',
    'Data Mapping',
  ];

  return (
    <aside
      className={clsx(
        'h-[calc(100vh-4rem)] bg-white flex flex-col flex-shrink-0 transition-all duration-300 z-20 sticky top-16 border-r border-slate-200/80 select-none shadow-[2px_0_12px_rgba(0,0,0,0.02)]',
        collapsed ? 'w-20' : 'w-64 lg:w-72'
      )}
    >
      {/* Navigation Groups List */}
      <div className="flex-1 overflow-y-auto py-5 px-3.5 space-y-6 custom-scrollbar">
        {categories.map((category) => {
          const items = NAV_ITEMS.filter((i) => i.category === category);
          return (
            <div key={category} className="space-y-1">
              {!collapsed ? (
                <p className="px-3 text-[11px] font-semibold text-[#94A3B8] tracking-wider mb-2 uppercase">
                  {category}
                </p>
              ) : (
                <div className="w-5 h-0.5 bg-slate-200 mx-auto my-3 rounded" />
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
                      'flex items-center rounded-xl transition-all group relative',
                      collapsed
                        ? 'justify-center p-2.5 my-1'
                        : 'px-3 py-2.5 gap-3 text-sm my-0.5',
                      isActive
                        ? 'bg-[#EDF5FE] text-[#0066FF] font-semibold shadow-xs'
                        : 'text-[#64748B] hover:text-[#1E293B] hover:bg-slate-50 font-medium'
                    )}
                  >
                    <span
                      className={clsx(
                        'flex-shrink-0 transition-colors',
                        isActive
                          ? 'text-[#0066FF]'
                          : 'text-[#94A3B8] group-hover:text-[#475569]'
                      )}
                    >
                      {item.icon}
                    </span>

                    {!collapsed && (
                      <span className="flex-1 truncate tracking-tight text-[13px]">
                        {item.label}
                      </span>
                    )}

                    {/* Subtle Right Chevron for inactive items matching Figma */}
                    {!isActive && !collapsed && (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
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
