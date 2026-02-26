'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { capture, mimeToFileType } from '@/lib/analytics'

type ViewState = 'loading' | 'decrypting' | 'ready' | 'already-opened' | 'error'

export default function DocumentViewer() {
  const params = useParams()
  const token = params.token as string

  const [viewState, setViewState] = useState<ViewState>('loading')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState('')
  const [ttlAfterView, setTtlAfterView] = useState(1800)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    if (initRef.current || !token) return
    initRef.current = true

    async function init() {
      const keyStr = window.location.hash.slice(1)
      if (!keyStr) {
        setErrorMsg('Missing decryption key — the link may be malformed.')
        setViewState('error')
        return
      }

      try {
        const res = await fetch(`/api/doc/${token}`)
        if (res.status === 410) {
          setViewState('already-opened')
          return
        }
        if (!res.ok) {
          throw new Error('Document not found or unavailable.')
        }

        const { iv, mimeType: mime, ttlAfterView: ttl } = await res.json()
        setMimeType(mime)
        setTtlAfterView(ttl ?? 1800)
        setViewState('decrypting')

        // Fetch ciphertext via API proxy — same-origin, no CORS issues
        const cipherRes = await fetch(`/api/file/${token}`)
        if (!cipherRes.ok) throw new Error('Failed to retrieve document data.')
        const ciphertext = await cipherRes.arrayBuffer()

        // Decrypt in browser — key never leaves client
        const { base64urlToKey, decryptFile } = await import('@/lib/crypto')
        const key = await base64urlToKey(keyStr)
        const plaintext = await decryptFile(ciphertext, key, iv)

        const blob = new Blob([plaintext], { type: mime })
        const url = URL.createObjectURL(blob)
        setBlobUrl(url)
        setViewState('ready')
        capture('DocumentViewed', { fileType: mimeToFileType(mime) })
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load document.')
        setViewState('error')
      }
    }

    init()

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const ttlLabel =
    ttlAfterView === 0 ? 'immediately after you close this tab'
    : ttlAfterView < 3600 ? `${Math.round(ttlAfterView / 60)} minutes after you close this tab`
    : '1 hour after you close this tab'

  // ── Already opened ──
  if (viewState === 'already-opened') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--red-dim)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 'clamp(24px, 4vw, 36px)', color: '#FFFFFF', textShadow: '2px 3px 0 #0D0D0D', letterSpacing: '-0.5px' }}>
          Document already opened
        </h1>
        <p style={{ fontSize: 15, color: '#0D0D0D', maxWidth: 400, lineHeight: 1.7, fontWeight: 500 }}>
          This link is one-time use only. For your protection, the document cannot be opened again.
        </p>
        <a href="/" style={{ marginTop: 8, padding: '12px 24px', background: 'var(--yellow)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#0D0D0D', textDecoration: 'none', boxShadow: 'var(--shadow-sm)' }}>
          Upload a new document
        </a>
      </div>
    )
  }

  // ── Error ──
  if (viewState === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--red-dim)', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 8 }}>⚠</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 28, color: '#FFFFFF', textShadow: '2px 3px 0 #0D0D0D' }}>Unable to load document</h1>
        <p style={{ fontSize: 14, color: '#0D0D0D', maxWidth: 360, lineHeight: 1.7 }}>{errorMsg}</p>
        <a href="/" style={{ marginTop: 8, padding: '12px 24px', background: 'var(--yellow)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#0D0D0D', textDecoration: 'none', boxShadow: 'var(--shadow-sm)' }}>
          ← Back to home
        </a>
      </div>
    )
  }

  // ── Loading / Decrypting ──
  if (viewState === 'loading' || viewState === 'decrypting') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(13,13,13,0.15)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ fontSize: 14, color: '#0D0D0D', fontWeight: 600 }}>
          {viewState === 'decrypting' ? 'Decrypting document…' : 'Loading…'}
        </p>
      </div>
    )
  }

  // ── Ready ──
  const isPDF   = mimeType === 'application/pdf'
  const isImage = mimeType.startsWith('image/')

  function handlePrint() {
    if (!blobUrl) return
    capture('DocumentPrinted', { fileType: mimeToFileType(mimeType) })

    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none'
    document.body.appendChild(frame)

    const cleanup = () => {
      if (document.body.contains(frame)) document.body.removeChild(frame)
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)

    if (isPDF) {
      // PDF: let the browser's native PDF viewer handle all pages
      frame.src = blobUrl
      frame.onload = () => frame.contentWindow?.print()
    } else {
      // Image: write a custom page so the image always fills exactly one printed page
      const doc = frame.contentDocument!
      doc.open()
      doc.write(`<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { margin: 0; size: auto; }
        html, body { width: 100%; height: 100%; background: #fff; }
        body { display: flex; align-items: center; justify-content: center; }
        img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
      </style></head><body>
        <img src="${blobUrl}" onload="window.print()">
      </body></html>`)
      doc.close()
    }
  }

  return (
    // position: relative + zIndex: 1 ensures content stacks above the body::before grid overlay (fixed, z-index: 0)
    <div style={{ minHeight: '100vh', paddingBottom: 80, position: 'relative', zIndex: 1 }}>

      {/* Amber security banner */}
      <div
        className="no-print"
        style={{ position: 'sticky', top: 0, zIndex: 100, background: '#FEF9C3', borderBottom: '2px solid #CA8A04', padding: '10px 20px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#92400E' }}
      >
        ⚠ This document will be deleted {ttlLabel}
      </div>

      {/* Document render area */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        {isPDF && blobUrl ? (
          <PDFViewer blobUrl={blobUrl} />
        ) : isImage && blobUrl ? (
          <div style={{ textAlign: 'center' }}>
            <img
              src={blobUrl}
              alt="Document"
              style={{ maxWidth: '100%', userSelect: 'none', pointerEvents: 'none', display: 'block', margin: '0 auto' }}
              onContextMenu={e => e.preventDefault()}
              draggable={false}
            />
          </div>
        ) : null}
      </div>

      {/* Sticky print button */}
      <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200 }}>
        <button
          onClick={handlePrint}
          style={{ padding: '14px 22px', background: 'var(--yellow)', border: '2px solid #0D0D0D', borderRadius: 12, fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: 8, color: '#0D0D0D' }}
        >
          🖨 Print
        </button>
      </div>
    </div>
  )
}

// Lazy-loaded PDF viewer — avoids SSR issues with react-pdf
function PDFViewer({ blobUrl }: { blobUrl: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ReactPDF, setReactPDF] = useState<any>(null)
  const [numPages, setNumPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    import('react-pdf').then(mod => {
      // Serve worker locally from public/ — CDN not reliable for pdfjs v5
      mod.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      setReactPDF(mod)
    })
  }, [])

  if (!ReactPDF) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(13,13,13,0.15)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  const { Document, Page } = ReactPDF
  const pageWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 48, 860) : 860

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <Document
        file={blobUrl}
        onLoadSuccess={({ numPages: n }: { numPages: number }) => setNumPages(n)}
        loading={
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(13,13,13,0.15)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        }
      >
        <Page
          pageNumber={currentPage}
          width={pageWidth}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {numPages > 1 && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 10, padding: '8px 16px', boxShadow: 'var(--shadow-xs)' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={{ width: 32, height: 32, borderRadius: 6, border: '2px solid #0D0D0D', background: currentPage <= 1 ? 'var(--surface2)' : 'var(--yellow)', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: currentPage <= 1 ? 0.5 : 1 }}
          >‹</button>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600, color: '#0D0D0D' }}>
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            style={{ width: 32, height: 32, borderRadius: 6, border: '2px solid #0D0D0D', background: currentPage >= numPages ? 'var(--surface2)' : 'var(--yellow)', cursor: currentPage >= numPages ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: currentPage >= numPages ? 0.5 : 1 }}
          >›</button>
        </div>
      )}
    </div>
  )
}
