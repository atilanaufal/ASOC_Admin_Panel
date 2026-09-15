'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import Image from 'next/image';
import Link from 'next/link';

interface AdminHeaderProps {
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export function AdminHeader({ onToggleSidebar, isSidebarCollapsed = false }: AdminHeaderProps) {
  const router = useRouter();
  const [wibTime, setWibTime] = useState<string>('10:21:01');

  // Real-time digital clock (HH:MM:SS) in Asia/Jakarta
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      };
      setWibTime(new Intl.DateTimeFormat('id-ID', options).format(now).replace(/\./g, ':'));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
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
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between sticky top-0 z-30 select-none shadow-xs">
      {/* Left side: Aligned with Sidebar width and edge */}
      <div
        className={clsx(
          'h-full flex items-center border-r border-gray-200/80 transition-all duration-300 flex-shrink-0',
          isSidebarCollapsed ? 'w-20 justify-center' : 'w-64 lg:w-72 justify-between px-4'
        )}
      >
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <div className="relative w-7 h-7 flex-shrink-0">
            <Image
              src="/asocLogo.png"
              alt="ASOC Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          {!isSidebarCollapsed && (
            <span className="font-aleo font-bold text-base md:text-lg text-black tracking-tight whitespace-nowrap truncate">
              ASOC Admin Portal
            </span>
          )}
        </Link>

        {/* When expanded: toggle button aligned with sidebar edge */}
        {!isSidebarCollapsed && onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="w-7 h-7 rounded-md bg-[#2B2D31] hover:bg-[#383A42] flex items-center p-1 transition-all duration-200 cursor-pointer shadow-sm active:scale-95 group flex-shrink-0"
            title="Collapse Sidebar"
          >
            <span className="h-full bg-white rounded-[2px] transition-all duration-200 ease-in-out w-3" />
          </button>
        )}
      </div>

      {/* Main Bar: Portal Title (when collapsed) & Right-side widgets */}
      <div className="flex-1 px-4 md:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* When collapsed: toggle button placed right beside border with clean spacing */}
          {isSidebarCollapsed && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="w-7 h-7 rounded-md bg-[#2B2D31] hover:bg-[#383A42] flex items-center p-1 transition-all duration-200 cursor-pointer shadow-sm active:scale-95 group flex-shrink-0"
              title="Expand Sidebar"
            >
              <span className="h-full bg-white rounded-[2px] transition-all duration-200 ease-in-out w-1.5" />
            </button>
          )}

          {isSidebarCollapsed && (
            <span className="font-aleo font-bold text-base md:text-lg text-black tracking-tight animate-in fade-in duration-200">
              ASOC Admin Portal
            </span>
          )}
        </div>

        {/* Right side: Digital Clock & Log Out matching Figma */}
        <div className="flex items-center gap-4 md:gap-6 ml-auto">
          {/* Digital Clock Box */}
          <div className="bg-[#F2F4F7] border border-gray-200/80 rounded px-3 py-1 flex items-center justify-center shadow-inner">
            <span className="font-aleo font-bold text-sm md:text-base text-[#4F4F4F] tracking-wide">
              {wibTime}
            </span>
          </div>

          {/* Log Out Button */}
          <button
            onClick={handleLogout}
            title="Sign out of Admin Portal"
            className="font-aleo font-bold text-sm md:text-base text-[#C70000] hover:text-red-700 transition-colors cursor-pointer hover:opacity-90 active:scale-95 flex items-center gap-1"
          >
            <span>Log Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
