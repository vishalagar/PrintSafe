import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, DocumentRow } from '@/lib/supabase'

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

  const { data: docData, error: fetchError } = await supabase
    .from('documents')
    .select(
      'status, file_name, file_size, mime_type, created_at, viewed_at, expires_at, ttl_after_view'
    )
    .eq('token', token)
    .single()

  if (fetchError || !docData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doc = docData as Pick<DocumentRow, 'status' | 'file_name' | 'file_size' | 'mime_type' | 'created_at' | 'viewed_at' | 'expires_at' | 'ttl_after_view'>

  return NextResponse.json({
    status: doc.status,
    fileName: doc.file_name,
    fileSize: doc.file_size,
    mimeType: doc.mime_type,
    createdAt: doc.created_at,
    viewedAt: doc.viewed_at,
    expiresAt: doc.expires_at,
    ttlAfterView: doc.ttl_after_view,
  })
}
