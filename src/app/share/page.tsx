'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface UploadData {
  token: string
  deleteToken: string
  key: string
  expiryLabel: string
  fileName: string
}

export default function SharePage() {
  const router = useRouter()
  const [data, setData] = useState<UploadData | null>(null)
  const [shareUrl, setShareUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('ps_upload')
    if (!raw) {
      router.replace('/')
      return
    }
    try {
      const parsed: UploadData = JSON.parse(raw)
      setData(parsed)

      const url = `${window.location.origin}/d/${parsed.token}#${parsed.key}`
      setShareUrl(url)

      // Save delete token to localStorage for status page
      localStorage.setItem(`ps_del_${parsed.token}`, parsed.deleteToken)

      // Generate QR code
      import('qrcode').then(({ default: QRCode }) => {
        QRCode.toDataURL(url, {
          width: 240,
          margin: 2,
          color: { dark: '#0D0D0D', light: '#FFFFFF' },
        }).then(setQrDataUrl)
      })
    } catch {
      router.replace('/')
    }
  }, [router])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: already selected via click on input
    }
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(13,13,13,0.15)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  const whatsappText = `Here's your secure document link (one-time use, expires after viewing):\n${shareUrl}`

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 1000, background: '#FFFFFF', borderBottom: '2px solid #0D0D0D', padding: '0 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.5px' }}>PrintSafe</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', border: '1.5px solid #0D0D0D', display: 'inline-block', animation: 'pulse-dot 3s ease-in-out infinite' }} />
          </a>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, background: 'var(--yellow)', border: '2px solid #0D0D0D', padding: '4px 10px', borderRadius: 6, boxShadow: 'var(--shadow-xs)' }}>
            Personal
          </span>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div className="wrap" style={{ paddingTop: 60, paddingBottom: 80 }}>

        {/* Success header */}
        <div style={{ textAlign: 'center', marginBottom: 36, animation: 'fade-up 0.5s ease both' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#DCFCE7', border: '2px solid #16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 16px', boxShadow: 'var(--shadow-sm)' }}>✓</div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 'clamp(26px, 4vw, 40px)', lineHeight: 1.1, letterSpacing: '-0.5px', color: '#FFFFFF', textShadow: '2px 3px 0 #0D0D0D', marginBottom: 8 }}>
            Your secure link is ready
          </h1>
          <p style={{ fontSize: 14, color: '#0D0D0D', fontWeight: 500 }}>Share it with your print shop — it can only be opened once</p>
        </div>

        <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Link card */}
          <div style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow)', animation: 'fade-up 0.5s 0.08s ease both' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10, fontWeight: 600 }}>Shareable link</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={shareUrl}
                onClick={e => (e.target as HTMLInputElement).select()}
                style={{ flex: 1, minWidth: 0, padding: '10px 12px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: 'var(--surface2)', border: '2px solid #0D0D0D', borderRadius: 8, color: '#0D0D0D', outline: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              />
              <button
                onClick={handleCopy}
                style={{ padding: '10px 18px', background: copied ? '#DCFCE7' : 'var(--yellow)', border: `2px solid ${copied ? '#16A34A' : '#0D0D0D'}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow-xs)', whiteSpace: 'nowrap', color: copied ? '#14532D' : '#0D0D0D', flexShrink: 0, transition: 'all 0.15s' }}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* QR code card */}
          <div style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow)', textAlign: 'center', animation: 'fade-up 0.5s 0.12s ease both' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 16, fontWeight: 600 }}>QR Code — show this to the print shop</div>
            <div style={{ display: 'inline-block', padding: 12, background: '#FFFFFF', border: '2px solid #0D0D0D', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR Code for secure document link" width={240} height={240} style={{ display: 'block' }} />
                : <div style={{ width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 24, height: 24, border: '3px solid rgba(13,13,13,0.15)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </div>
              }
            </div>
          </div>

          {/* Info row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', animation: 'fade-up 0.5s 0.16s ease both' }}>
            {/* Expiry badge */}
            <div style={{ flex: 1, minWidth: 180, background: '#FEF9C3', border: '2px solid #CA8A04', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>⏱</span>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, color: '#92400E', marginBottom: 2 }}>Auto-deletes</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#78350F' }}>{data.expiryLabel}</div>
              </div>
            </div>
            {/* File badge */}
            <div style={{ flex: 1, minWidth: 180, background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: 'var(--shadow-xs)' }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 2 }}>Document</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0D0D0D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.fileName}</div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', animation: 'fade-up 0.5s 0.2s ease both' }}>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, minWidth: 'calc(50% - 5px)', padding: '13px 16px', background: '#22C55E', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', color: '#FFFFFF', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Share on WhatsApp
            </a>
            <a
              href={`/status/${data.token}`}
              style={{ flex: 1, minWidth: 'calc(50% - 5px)', padding: '13px 16px', background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', color: '#0D0D0D', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              📊 Track document →
            </a>
          </div>

          {/* Upload another */}
          <div style={{ textAlign: 'center', paddingTop: 4, animation: 'fade-up 0.5s 0.24s ease both' }}>
            <a href="/" style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600, textDecoration: 'none' }}>
              ← Upload another document
            </a>
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '2px solid rgba(13,13,13,0.2)', padding: '32px 0 28px', textAlign: 'center' }}>
        <div className="wrap">
          <p style={{ fontSize: 12, color: '#0D0D0D', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>Encrypted in browser · Never stored · Permanent deletion</p>
        </div>
      </footer>
    </div>
  )
}
