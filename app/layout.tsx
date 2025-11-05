import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Initialize server-side cron jobs
// Import serverInit only on server side
if (typeof window === 'undefined') {
  import('@/lib/serverInit').catch((err) => {
    // Silently catch errors during development hot reload
    if (process.env.NODE_ENV !== 'production') {
      // In dev mode, ignore module not found errors during hot reload
      if (!err.message?.includes('ENOENT')) {
        console.error('Failed to initialize server cron jobs:', err);
      }
    } else {
      console.error('Failed to initialize server cron jobs:', err);
    }
  });
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Portfolio Dashboard",
  description: "Investment Portfolio Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Unregister any existing service workers
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister();
                    console.log('Service Worker unregistered');
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
