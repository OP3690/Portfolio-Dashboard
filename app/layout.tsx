import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Initialize server-side cron jobs
if (typeof window === 'undefined') {
  import('@/lib/serverInit').catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      if (!err.message?.includes('ENOENT')) console.error('Failed to initialize server cron jobs:', err);
    } else {
      console.error('Failed to initialize server cron jobs:', err);
    }
  });
}

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Portfolio Dashboard — Investment Analytics',
  description: 'Advanced investment portfolio management with real-time analytics, performance tracking, and intelligent insights.',
  keywords: 'portfolio, stocks, investments, analytics, dashboard',
  themeColor: '#0a0f1e',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased" style={{ background: '#0a0f1e', color: '#f0f4ff' }}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>{for(let reg of r)reg.unregister();})}`,
          }}
        />
      </body>
    </html>
  );
}
