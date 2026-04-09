import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  metadataBase: new URL("https://printsafe.in"),
  verification: {
    google: "-YXV_86XrlY3khfbPPD4XXSsbSU0KBX5emA2M88-4Sk",
  },
  title: "PrintSafe — Self-Destructing Document Sharing",
  description:
    "Share sensitive documents securely. Encrypted in your browser, shared via one-time links, and permanently shredded after viewing.",
  keywords: [
    "secure document sharing",
    "self-destructing documents",
    "encrypted file sharing",
    "one-time link",
    "print safe",
    "document shredding",
    "auto-delete files",
    "private file sharing",
  ], 
  openGraph: {
    title: "PrintSafe — Self-Destructing Document Sharing",
    description:
      "Share sensitive documents securely. Encrypted in your browser, shared via one-time links, and permanently shredded after viewing.",
    url: "https://printsafe.in",
    type: "website",
    siteName: "PrintSafe",
  },
  twitter: {
    card: "summary_large_image",
    title: "PrintSafe — Self-Destructing Document Sharing",
    description:
      "Share sensitive documents securely. Encrypted in your browser, shared via one-time links, and permanently shredded after viewing.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" sizes="192x192" />
        <link rel="icon" href="/icon-512.png" sizes="512x512" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* JSON-LD for Google Search Organization / Logo */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "PrintSafe",
              url: "https://printsafe.in",
              logo: "https://printsafe.in/icon-512.png",
              image: "https://printsafe.in/icon-512.png",
            }),
          }}
        />
        {/* Blocking script: reads localStorage before first paint — prevents FOUC.
            Content is a static string with no user input; safe from XSS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='dark')?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`,
          }}
        />
        {/* Register Service Worker for PWA / Web Share Target */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' })); }`,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
