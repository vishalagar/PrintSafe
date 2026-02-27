'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { capture, mimeToFileType, sizeToFileSizeBucket, ttlToLabel } from '@/lib/analytics'

const EXPIRY_OPTIONS = [
  { label: 'View once', ttl: 0 },
  { label: '15 min',    ttl: 900 },
  { label: '30 min',    ttl: 1800 },
  { label: '1 hour',    ttl: 3600 },
]

const EXPIRY_LABEL: Record<number, string> = {
  0:    'View once — deleted immediately',
  900:  '15 minutes after first view',
  1800: '30 minutes after first view',
  3600: '1 hour after first view',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)    return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const MIME_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
  'image/heif': 'HEIF',
}

const ALLOWED_MIMES = Object.keys(MIME_LABEL)

const EXT_TO_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
}

function getEffectiveMime(file: File): string {
  // Direct match against allowed list
  if (file.type && ALLOWED_MIMES.includes(file.type)) return file.type
  // iOS can report HEIC variants like image/heic-sequence (burst) or image/heif-sequence
  // for Apple HDR photos — normalize them to image/heic
  if (file.type && file.type.startsWith('image/hei')) return 'image/heic'
  // Extension fallback for files where iOS omits or garbles the MIME type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]
  // Last resort: return whatever the browser gave us (server will reject if invalid)
  return file.type
}

export default function UploadPage() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile]             = useState<File | null>(null)
  const [ttl, setTtl]               = useState(1800)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const handleFile = useCallback((f: File) => {
    setError(null)
    if (f.size > 26214400) {
      setError('File is too large — maximum size is 25 MB.')
      return
    }
    const effectiveMime = getEffectiveMime(f)
    if (!ALLOWED_MIMES.includes(effectiveMime)) {
      const detected = f.type ? ` (detected: ${f.type})` : ' (type unknown)'
      setError(`Unsupported file type${detected}. Please upload a PDF, JPG, PNG, or HEIC.`)
      return
    }
    setFile(f)
    capture('FileSelected', { fileType: mimeToFileType(effectiveMime), fileSizeBucket: sizeToFileSizeBucket(f.size) })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }, [handleFile])

  async function handleUpload() {
    if (!file || isUploading) return
    let errorTracked = false
    setIsUploading(true)
    setError(null)
    capture('UploadStarted', { fileType: mimeToFileType(getEffectiveMime(file)), ttlLabel: ttlToLabel(ttl) })
    try {
      const { encryptFile, keyToBase64url } = await import('@/lib/crypto')
      const { ciphertext, iv, key } = await encryptFile(file)

      const effectiveMime = getEffectiveMime(file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-iv':       iv,
          'x-filename': encodeURIComponent(file.name),
          'x-filesize': String(file.size),
          'x-mimetype': effectiveMime,
          'x-ttl':      String(ttl),
        },
        body: ciphertext,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        capture('UploadError', { reason: res.status === 429 ? 'ratelimit' : 'api' })
        errorTracked = true
        throw new Error(res.status === 429
          ? 'Too many uploads — please try again in an hour.'
          : (data.error ?? 'Upload failed. Please try again.'))
      }

      const { token, deleteToken } = await res.json()
      const keyStr = await keyToBase64url(key)
      capture('UploadSuccess', { fileType: mimeToFileType(effectiveMime), ttlLabel: ttlToLabel(ttl) })

      sessionStorage.setItem('ps_upload', JSON.stringify({
        token, deleteToken, key: keyStr,
        expiryLabel: EXPIRY_LABEL[ttl],
        fileName: file.name,
      }))

      router.push('/share')
    } catch (err: unknown) {
      if (!errorTracked) capture('UploadError', { reason: 'encryption' })
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setIsUploading(false)
    }
  }

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

      {/* ── HERO ── */}
      <div className="wrap" style={{ paddingTop: 80, paddingBottom: 60, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '2.5px', textTransform: 'uppercase', fontWeight: 700, background: 'var(--yellow)', border: '2px solid #0D0D0D', padding: '6px 16px', borderRadius: 100, marginBottom: 28, boxShadow: 'var(--shadow-xs)', animation: 'fade-up 0.6s ease both' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#0D0D0D', animation: 'blink 1.5s ease-in-out infinite' }} />
          AES-256 Encrypted · Zero Storage
        </div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 'clamp(36px, 5.5vw, 64px)', lineHeight: 1.06, letterSpacing: '-1px', marginBottom: 20, color: '#FFFFFF', textShadow: '3px 4px 0 #0D0D0D', animation: 'fade-up 0.6s 0.1s ease both' }}>
          Print anything.<br />Leave nothing.
        </h1>
        <p style={{ fontSize: 17, color: '#0D0D0D', maxWidth: 520, margin: '0 auto', lineHeight: 1.8, fontWeight: 500, animation: 'fade-up 0.6s 0.2s ease both' }}>
          Your documents are <strong style={{ fontWeight: 800 }}>encrypted in your browser</strong>, shared via a one-time link, and permanently deleted after printing.
        </p>
      </div>

      {/* ── UPLOAD CARD ── */}
      <div className="wrap" style={{ paddingBottom: 80 }}>
        <div className="upload-card" style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 16, padding: 36, boxShadow: 'var(--shadow)', animation: 'fade-up 0.6s 0.3s ease both' }}>

          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 20, letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
              <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--yellow)', border: '2px solid #0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: 'var(--shadow-xs)', flexShrink: 0 }}>🔒</span>
              Secure Upload
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, background: 'var(--surface2)', border: '2px solid #0D0D0D', padding: '4px 10px', borderRadius: 6, boxShadow: 'var(--shadow-xs)', whiteSpace: 'nowrap', flexShrink: 0 }}>Free · No Account</span>
          </div>

          {/* Drop zone */}
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} style={{ display: 'none' }} />
          <div
            onClick={() => !file && inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            style={{
              border: `2px ${isDragging ? 'solid' : 'dashed'} ${isDragging ? '#0D0D0D' : 'rgba(13,13,13,0.3)'}`,
              borderRadius: 12, padding: file ? '20px 24px' : '48px 24px',
              textAlign: 'center', cursor: file ? 'default' : 'pointer',
              background: isDragging ? '#FFFBEA' : 'var(--surface2)',
              marginBottom: 20, transition: 'all 0.2s ease',
            }}
          >
            {!file ? (
              <>
                <div style={{ width: 56, height: 56, margin: '0 auto 16px', background: '#FFFFFF', border: '2px solid #0D0D0D', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: 'var(--shadow-sm)' }}>📄</div>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0D0D0D', marginBottom: 4 }}>Drop your document here</p>
                <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>or <span style={{ color: '#0D0D0D', fontWeight: 700, textDecoration: 'underline' }}>click to browse</span></p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>{file.type === 'application/pdf' ? '📋' : file.type.startsWith('image') ? '🖼️' : '📝'}</span>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <span>{formatBytes(file.size)}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', background: 'var(--yellow)', border: '1.5px solid #0D0D0D', padding: '1px 6px', borderRadius: 4, color: '#0D0D0D', fontWeight: 700 }}>{MIME_LABEL[getEffectiveMime(file)] ?? 'FILE'}</span>
                  </p>
                </div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setError(null) }} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red-dim)', border: '2px solid var(--red)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--red)', flexShrink: 0, minWidth: 28 }}>✕</button>
              </div>
            )}
          </div>

          {/* File chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', marginRight: 4, fontWeight: 500 }}>Accepted:</span>
            {['PDF', 'JPG', 'PNG', 'HEIC'].map(t => (
              <span key={t} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700, background: '#FFFFFF', border: '1.5px solid #0D0D0D', padding: '3px 9px', borderRadius: 5, boxShadow: '1px 1px 0 #0D0D0D' }}>{t}</span>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>· up to 25 MB</span>
          </div>

          {/* Expiry pills */}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 10, display: 'block', fontWeight: 500 }}>Auto-delete after:</span>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {EXPIRY_OPTIONS.map(opt => (
              <button key={opt.ttl} onClick={() => setTtl(opt.ttl)} style={{ flex: 1, minWidth: 'calc(50% - 4px)', padding: '10px 16px', borderRadius: 8, border: '2px solid #0D0D0D', background: ttl === opt.ttl ? 'var(--yellow)' : '#FFFFFF', color: ttl === opt.ttl ? '#0D0D0D' : 'var(--text-dim)', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'transform 0.1s, box-shadow 0.1s', whiteSpace: 'nowrap' }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'var(--red-dim)', border: '2px solid var(--red)', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
              ⚠ {error}
            </div>
          )}

          {/* CTA */}
          <button onClick={handleUpload} disabled={!file || isUploading} style={{ width: '100%', padding: '16px 24px', background: file && !isUploading ? 'var(--yellow)' : 'var(--surface2)', color: '#0D0D0D', fontWeight: 700, fontSize: 15.5, borderRadius: 10, border: '2px solid #0D0D0D', cursor: file && !isUploading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '4px 4px 0 #0D0D0D', transition: 'transform 0.1s, box-shadow 0.1s', marginBottom: 14, opacity: !file || isUploading ? 0.65 : 1 }}>
            {isUploading
              ? <><span style={{ width: 16, height: 16, border: '2.5px solid rgba(13,13,13,0.25)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Encrypting…</>
              : <>🔒 Encrypt &amp; Create Link</>
            }
          </button>

          {/* Trust row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            <span>🔒 AES-256 encrypted</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>✕ No server storage</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>🔗 One-time link</span>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '2px solid rgba(13,13,13,0.2)', padding: '40px 0 36px', textAlign: 'center' }}>
        <div className="wrap">
          <p style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontWeight: 700, fontSize: 17, color: '#FFFFFF', textShadow: '1px 2px 0 #0D0D0D', marginBottom: 8 }}>"Print anything. Leave nothing."</p>
          <p style={{ fontSize: 12.5, color: '#0D0D0D', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>Encrypted in browser · Never stored · Permanent deletion</p>
        </div>
      </footer>
    </div>
  )
}
