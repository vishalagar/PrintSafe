'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { capture } from '@/lib/analytics'

type DocStatus = 'pending' | 'viewed' | 'deleted' | 'expired'

interface StatusData {
  status: DocStatus
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  viewedAt: string | null
  expiresAt: string | null
  ttlAfterView: number
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function StatusPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<StatusData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCountdown(viewedAt: string, ttlAfterView: number) {
    if (countdownRef.current) clearInterval(countdownRef.current)
    const expiresMs = new Date(viewedAt).getTime() + ttlAfterView * 1000
    function tick() {
      const remaining = expiresMs - Date.now()
      setCountdown(remaining > 0 ? formatCountdown(remaining) : '00:00')
      if (remaining <= 0 && countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`/api/status/${token}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const json: StatusData = await res.json()
      setData(json)

      if (json.status === 'viewed' && json.viewedAt && json.ttlAfterView > 0) {
        startCountdown(json.viewedAt, json.ttlAfterView)
      }

      // Stop polling on terminal state
      if ((json.status === 'deleted' || json.status === 'expired') && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    } catch {
      // silently retry on next poll
    }
  }

  useEffect(() => {
    if (!token) return
    fetchStatus()
    pollRef.current = setInterval(fetchStatus, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function handleDelete() {
    const deleteToken = localStorage.getItem(`ps_del_${token}`)
      ?? sessionStorage.getItem(`ps_del_${token}`)
    if (!deleteToken) {
      setDeleteError('Delete token not found. You can only delete from the browser where you originally uploaded the document.')
      return
    }
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/doc/${token}`, {
        method: 'DELETE',
        headers: { 'x-delete-token': deleteToken },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed. Please try again.')
      }
      setShowConfirm(false)
      capture('ManualDelete')
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
      setData(prev => prev ? { ...prev, status: 'deleted' } : prev)
      setCountdown(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Not found ──
  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 28, color: '#FFFFFF', textShadow: '2px 3px 0 #0D0D0D' }}>Document not found</h1>
        <p style={{ fontSize: 14, color: '#0D0D0D', maxWidth: 340, lineHeight: 1.7 }}>This token does not exist or the document has been fully purged.</p>
        <a href="/" style={{ marginTop: 12, padding: '12px 24px', background: 'var(--yellow)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 14, color: '#0D0D0D', textDecoration: 'none', boxShadow: 'var(--shadow-sm)' }}>← Back to home</a>
      </div>
    )
  }

  // ── Loading ──
  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(13,13,13,0.2)', borderTopColor: '#0D0D0D', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  const STATUS_CONFIG: Record<DocStatus, { label: string; bg: string; border: string; text: string; dot: string }> = {
    pending:  { label: 'Pending — Not yet opened',        bg: '#FEF9C3',         border: '#CA8A04',      text: '#92400E',      dot: '#F59E0B' },
    viewed:   { label: 'Viewed — Document opened',        bg: '#DCFCE7',         border: '#16A34A',      text: '#14532D',      dot: '#22C55E' },
    deleted:  { label: 'Deleted — Permanently destroyed', bg: 'var(--red-dim)',  border: 'var(--red)',   text: 'var(--red)',   dot: 'var(--red)' },
    expired:  { label: 'Expired — Never opened',          bg: 'rgba(255,255,255,0.1)', border: '#9CA3AF', text: '#374151',    dot: '#9CA3AF' },
  }

  const sc = STATUS_CONFIG[data.status]
  const canDelete = data.status === 'pending' || data.status === 'viewed'

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 1000, background: '#FFFFFF', borderBottom: '2px solid #0D0D0D', padding: '0 24px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 20, letterSpacing: '-0.5px', color: '#0D0D0D' }}>PrintSafe</span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', border: '1.5px solid #0D0D0D', display: 'inline-block' }} />
          </a>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, background: 'var(--surface2)', border: '2px solid #0D0D0D', padding: '4px 10px', borderRadius: 6 }}>
            Status
          </span>
        </div>
      </nav>

      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom: 28, animation: 'fade-up 0.5s ease both' }}>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 'clamp(24px, 4vw, 36px)', letterSpacing: '-0.5px', color: '#FFFFFF', textShadow: '2px 3px 0 #0D0D0D', marginBottom: 4 }}>
              Document Status
            </h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>
              {data.fileName} · {formatBytes(data.fileSize)}
            </p>
          </div>

          {/* Status badge */}
          <div style={{ background: sc.bg, border: `2px solid ${sc.border}`, borderRadius: 12, padding: '14px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, animation: 'fade-up 0.5s 0.05s ease both' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: sc.dot, flexShrink: 0, border: `1.5px solid ${sc.border}` }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: sc.text, flex: 1 }}>{sc.label}</span>
            {data.status === 'viewed' && data.viewedAt && (
              <span style={{ fontSize: 11, color: sc.text, opacity: 0.75, flexShrink: 0 }}>{formatTime(data.viewedAt)}</span>
            )}
          </div>

          {/* Countdown */}
          {data.status === 'viewed' && countdown && data.ttlAfterView > 0 && (
            <div style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 12, padding: '20px 24px', marginBottom: 16, textAlign: 'center', boxShadow: 'var(--shadow)', animation: 'fade-up 0.5s 0.1s ease both' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8, fontWeight: 600 }}>Deletes in</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 'clamp(40px, 10vw, 64px)', letterSpacing: '-1px', color: '#FFFFFF', textShadow: '3px 4px 0 #0D0D0D', lineHeight: 1 }}>
                {countdown}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 14, padding: 24, marginBottom: 16, boxShadow: 'var(--shadow)', animation: 'fade-up 0.5s 0.15s ease both' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 18, fontWeight: 600 }}>
              Timeline
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <TimelineItem
                label="Uploaded"
                time={data.createdAt}
                color="#22C55E"
                isLast={data.status === 'pending'}
              />
              {(data.status === 'viewed' || data.status === 'deleted') && (
                <TimelineItem
                  label="Opened"
                  time={data.viewedAt}
                  color="#F59E0B"
                  isLast={data.status === 'viewed'}
                />
              )}
              {data.status === 'deleted' && (
                <TimelineItem label="Deleted" time={null} color="var(--red)" isLast />
              )}
              {data.status === 'expired' && (
                <TimelineItem label="Expired" time={data.expiresAt} color="#9CA3AF" isLast />
              )}
            </div>
          </div>

          {/* Delete button */}
          {canDelete && (
            <button
              onClick={() => setShowConfirm(true)}
              style={{ width: '100%', padding: '14px 20px', background: 'var(--red-dim)', border: '2px solid var(--red)', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, animation: 'fade-up 0.5s 0.2s ease both' }}
            >
              🗑 Delete now
            </button>
          )}

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 8, animation: 'fade-up 0.5s 0.25s ease both' }}>
            <a
              href="/share"
              style={{ flex: 1, padding: '12px 16px', background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 13, color: '#0D0D0D', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: 'var(--shadow-sm)' }}
            >
              ← Back to share
            </a>
            <a
              href="/"
              style={{ flex: 1, padding: '12px 16px', background: 'var(--surface2)', border: '2px solid #0D0D0D', borderRadius: 10, fontWeight: 700, fontSize: 13, color: 'var(--text-dim)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              Upload another
            </a>
          </div>

        </div>
      </div>

      {/* ── Confirmation modal ── */}
      {showConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowConfirm(false); setDeleteError(null) } }}
        >
          <div style={{ background: 'var(--surface)', border: '2px solid #0D0D0D', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: 'var(--shadow)' }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: 22, marginBottom: 10, letterSpacing: '-0.3px', color: '#FFFFFF', textShadow: '1px 2px 0 #0D0D0D' }}>
              Delete this document?
            </h2>
            <p style={{ fontSize: 14, color: '#0D0D0D', lineHeight: 1.75, marginBottom: 20 }}>
              This will <strong>permanently destroy</strong> the document from our servers. This action cannot be undone.
            </p>
            {deleteError && (
              <div style={{ background: 'var(--red-dim)', border: '2px solid var(--red)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                ⚠ {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowConfirm(false); setDeleteError(null) }}
                style={{ flex: 1, padding: '12px 16px', background: '#FFFFFF', border: '2px solid #0D0D0D', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#0D0D0D' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={{ flex: 1, padding: '12px 16px', background: isDeleting ? 'var(--surface2)' : 'var(--red-dim)', border: '2px solid var(--red)', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: isDeleting ? 'not-allowed' : 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {isDeleting
                  ? <><span style={{ width: 13, height: 13, border: '2px solid rgba(251,113,133,0.3)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} /> Deleting…</>
                  : '🗑 Confirm delete'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '2px solid rgba(13,13,13,0.2)', padding: '32px 0 28px', textAlign: 'center' }}>
        <div className="wrap">
          <p style={{ fontSize: 12, color: '#0D0D0D', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.5px' }}>
            Encrypted in browser · Never stored · Permanent deletion
          </p>
        </div>
      </footer>
    </div>
  )
}

function TimelineItem({ label, time, color, isLast }: {
  label: string
  time: string | null
  color: string
  isLast: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 22, position: 'relative' }}>
      {!isLast && (
        <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 2, background: 'rgba(13,13,13,0.1)' }} />
      )}
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, border: '2px solid #0D0D0D', flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0D0D0D', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
          {formatTime(time)}
        </div>
      </div>
    </div>
  )
}
