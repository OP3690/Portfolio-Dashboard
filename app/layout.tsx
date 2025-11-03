import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Initialize server-side cron jobs automatically on server start
// This runs only on the server side, not in the browser
// The serverInit module will automatically set up the cron job when imported
if (typeof window === 'undefined') {
  // Use dynamic import to ensure it only runs on server
  import('@/lib/serverInit').catch((err) => {
    console.error('Failed to initialize server cron jobs:', err);
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
