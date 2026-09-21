'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { AdminHeader } from '@/components/layout/AdminHeader';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FA] text-slate-800">
      {/* Top Global Header spanning full width matching Figma */}
      <AdminHeader
        onToggleSidebar={() => setCollapsed(!collapsed)}
        isSidebarCollapsed={collapsed}
      />

      {/* Main Body: Sidebar on Left, Page Content on Right */}
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


