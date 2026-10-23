'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { AdminHeader } from '@/components/layout/AdminHeader';
import { AutoLogout } from '@/components/layout/AutoLogout';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let activeSession = sessionStorage.getItem('asoc_browser_session');
      if (!activeSession) {
        // Tab refreshed or newly opened tab with valid server session: seed active browser session
        sessionStorage.setItem('asoc_browser_session', Date.now().toString());
      }
      setSessionReady(true);
    }
  }, []);

  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7FA]">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA] text-slate-800">
      <AutoLogout />
      <AdminHeader
        onToggleSidebar={() => setCollapsed(!collapsed)}
        isSidebarCollapsed={collapsed}
      />
      <div className="flex-1 flex min-w-0">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 p-4 md:p-6 2xl:p-8 max-w-[1920px] w-full mx-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
