import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

if (typeof window === 'undefined') {
  import('@/lib/serverInit').catch((err) => {
    if (process.env.NODE_ENV !== 'production') {
      if (!err.message?.includes('ENOENT')) console.error('serverInit failed:', err);
    } else {
      console.error('serverInit failed:', err);
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f9' },
    { media: '(prefers-color-scheme: dark)',  color: '#0d1117' },
  ],
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Prevent FOUC: apply theme before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t==null&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>{for(var reg of r)reg.unregister();});}`,
          }}
        />
      </body>
    </html>
  );
}
