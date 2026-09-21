import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ASOC Admin Portal',
  description: 'Academic Security Operations Center Central Administration & Diagnostic Portal',
  icons: {
    icon: '/infoguard.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
