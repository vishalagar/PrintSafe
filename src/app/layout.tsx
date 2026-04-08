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
        {/* Blocking script: reads localStorage before first paint — prevents FOUC.
            Content is a static string with no user input; safe from XSS. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='dark')?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`,
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&display=swap"
          rel="stylesheet"
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
