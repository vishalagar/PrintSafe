import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PrintSafe — Self-Destructing Documents',
  description: 'Share sensitive documents securely. Encrypted, one-time links that self-destruct after printing.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;700&family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
