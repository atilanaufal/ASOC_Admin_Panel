import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASOC Superadmin Portal | Multi-Tenant Management',
  description: 'Academic Security Operations Center Central Administration & Diagnostic Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
