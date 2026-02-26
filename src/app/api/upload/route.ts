import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { uploadEncryptedBlob, deleteR2Object } from '@/lib/r2'
import { checkRateLimit } from '@/lib/redis'

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]

const MAX_FILE_SIZE = 26_214_400 // 25 MB

const ALLOWED_TTLS = [0, 900, 1800, 3600]

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'

  let allowed: boolean
  try {
    allowed = await checkRateLimit(ip, 10, 3600)
  } catch {
    allowed = true // fail open
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // 2. Read metadata from headers (avoids multipart/formData parsing issues)
  const iv             = req.headers.get('x-iv')
  const fileNameRaw    = req.headers.get('x-filename')
  const fileSizeRaw    = req.headers.get('x-filesize')
  const mimeType       = req.headers.get('x-mimetype')
  const ttlAfterViewRaw = req.headers.get('x-ttl')

  // 3. Validate presence
  if (!iv || !fileNameRaw || !fileSizeRaw || !mimeType || !ttlAfterViewRaw) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const fileName    = decodeURIComponent(fileNameRaw)
  const fileSize    = parseInt(fileSizeRaw, 10)
  const ttlAfterView = parseInt(ttlAfterViewRaw, 10)

  if (!ALLOWED_MIMES.includes(mimeType)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  if (isNaN(fileSize) || fileSize > MAX_FILE_SIZE || fileSize <= 0) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 })
  }

  if (isNaN(ttlAfterView) || !ALLOWED_TTLS.includes(ttlAfterView)) {
    return NextResponse.json({ error: 'Invalid TTL' }, { status: 400 })
  }

  // Sanitize fileName — strip path components, keep only the base name
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-\s]/g, '').trim().slice(0, 255) || 'document'

  // 4. Read ciphertext from request body
  let buffer: Buffer
  try {
    buffer = Buffer.from(await req.arrayBuffer())
  } catch {
    return NextResponse.json({ error: 'Failed to read file data' }, { status: 400 })
  }

  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Empty file data' }, { status: 400 })
  }

  // 5. Generate identifiers — storageKey is always an opaque UUID
  const storageKey  = crypto.randomUUID()
  const token       = nanoid(21)
  const deleteToken = nanoid(21)

  // 6. Upload to R2
  try {
    await uploadEncryptedBlob(storageKey, buffer, 'application/octet-stream')
  } catch {
    return NextResponse.json({ error: 'Storage upload failed' }, { status: 500 })
  }

  // 7. Hash IP — store only the hash, never the raw IP
  const ipHash = createHash('sha256').update(ip).digest('hex')

  // 8. Insert into Supabase
  const supabase = createServerSupabaseClient()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { error: dbError } = await supabase.from('documents').insert({
    token,
    delete_token: deleteToken,
    storage_key: storageKey,
    file_name: safeFileName,
    file_size: fileSize,
    mime_type: mimeType,
    status: 'pending',
    iv,
    expires_at: expiresAt,
    ttl_after_view: ttlAfterView,
    ip_hash: ipHash,
  })

  if (dbError) {
    // Clean up R2 object if DB insert fails — best-effort
    try {
      await deleteR2Object(storageKey)
    } catch {
      // ignore cleanup error; R2 lifecycle rule will purge it
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  return NextResponse.json({ token, deleteToken })
}
