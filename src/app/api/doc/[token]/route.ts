import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, DocumentRow } from '@/lib/supabase'
import { deleteR2Object } from '@/lib/r2'

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(req: NextRequest, context: RouteContext) {
  // Next.js 15: params is a Promise
  const { token } = await context.params

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // 1. Lookup token
  const { data: docData, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('token', token)
    .single()

  if (fetchError || !docData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doc = docData as DocumentRow

  // 2. Status gate
  if (doc.status === 'deleted' || doc.status === 'expired') {
    return NextResponse.json({ error: 'gone' }, { status: 410 })
  }

  // 3. Mark as viewed on first access
  if (doc.status === 'pending') {
    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('token', token)
      .eq('status', 'pending') // guard against concurrent requests

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }
  }

  // 4. Return metadata — ciphertext is proxied via /api/file/[token] (avoids CORS)
  return NextResponse.json({
    iv: doc.iv,
    fileName: doc.file_name,
    mimeType: doc.mime_type,
    ttlAfterView: doc.ttl_after_view,
    viewedAt: doc.viewed_at ?? new Date().toISOString(),
    status: doc.status === 'pending' ? 'viewed' : doc.status,
  })
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  // Next.js 15: params is a Promise
  const { token } = await context.params

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  // 1. Read delete token from header
  const deleteToken = req.headers.get('x-delete-token')

  if (!deleteToken) {
    return NextResponse.json({ error: 'Missing delete token' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()

  // 2. Lookup document
  const { data: docData2, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('token', token)
    .single()

  if (fetchError || !docData2) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doc = docData2 as DocumentRow

  // 3. Verify delete token — constant-time comparison not available server-side
  //    but delete_token is a random nanoid so timing attacks are not a meaningful threat here
  if (doc.delete_token !== deleteToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Already deleted or expired — idempotent response
  if (doc.status === 'deleted') {
    return NextResponse.json({ success: true })
  }

  // 5. Delete from R2
  try {
    await deleteR2Object(doc.storage_key)
  } catch {
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }

  // 6. Update status in Supabase
  const { error: updateError } = await supabase
    .from('documents')
    .update({ status: 'deleted' })
    .eq('token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
