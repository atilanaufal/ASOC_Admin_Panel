'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, LogOut } from 'lucide-react';

interface AdminHeaderProps {
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export function AdminHeader({
  onToggleSidebar,
  isSidebarCollapsed = false,
}: AdminHeaderProps) {
  const router = useRouter();
  const [timeString, setTimeString] = useState<string>('13:22:23');
  const [dateString, setDateString] = useState<string>('31 Dec 2026');
  const [showDropdown, setShowDropdown] = useState(false);

  // Real-time digital clock and date matching Figma format: 13:22:23 - 31 Dec 2026
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const timeOpts: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      const dateOpts: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      };

      setTimeString(
        new Intl.DateTimeFormat('id-ID', timeOpts).format(now).replace(/\./g, ':')
      );
      setDateString(new Intl.DateTimeFormat('en-GB', dateOpts).format(now));
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between sticky top-0 z-30 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left section: Logo & Portal title */}
      <div
        className={clsx(
          'h-full flex items-center border-r border-slate-200/80 transition-all duration-300 flex-shrink-0 px-4 md:px-5 justify-between',
          isSidebarCollapsed ? 'w-20 justify-center' : 'w-64 lg:w-72'
        )}
      >
        <Link href="/database-status" className="flex items-center gap-3 overflow-hidden">
          <div className="relative w-8 h-8 flex-shrink-0">
            <Image
              src="/infoguard.png"
              alt="InfoGuard Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          {!isSidebarCollapsed && (
            <span className="font-bold text-base md:text-lg text-slate-800 tracking-tight whitespace-nowrap truncate font-sans">
              ASOC Admin Portal
            </span>
          )}
        </Link>
      </div>

      {/* Center & Right bar */}
      <div className="flex-1 px-4 md:px-6 flex items-center justify-between">
        {/* Left: Hamburger button */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Right side: Clock, Date, and User Profile matching Figma */}
        <div className="flex items-center gap-5 md:gap-8 ml-auto">
          {/* Digital Clock & Date */}
          <div className="text-xs md:text-sm font-medium text-slate-600 tracking-wide font-mono hidden sm:flex items-center gap-2">
            <span>{timeString}</span>
            <span className="text-slate-300">—</span>
            <span className="text-slate-500">{dateString}</span>
          </div>

          {/* User Profile avatar + SOC_LAB name */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-[#0066FF] text-white flex items-center justify-center font-bold text-xs shadow-sm shadow-blue-500/20">
                S
              </div>
              <span className="font-bold text-xs md:text-sm text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">
                SOC_LAB
              </span>
            </button>

            {/* Dropdown for Logout */}
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200/80 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3.5 py-2 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-900">Administrator</p>
                  <p className="text-[11px] text-slate-400 truncate">superadmin@asoc.id</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
