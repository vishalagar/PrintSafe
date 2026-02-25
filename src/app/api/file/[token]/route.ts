import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, DocumentRow } from '@/lib/supabase'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

// Separate R2 client instance for streaming — same config as r2.ts
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

type RouteContext = {
  params: Promise<{ token: string }>
}

// Proxy the encrypted ciphertext from R2 to the browser.
// Avoids CORS issues with direct R2 presigned URL fetches.
// The blob is encrypted — key never touches this server.
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: docData, error } = await supabase
    .from('documents')
    .select('storage_key, status')
    .eq('token', token)
    .single()

  if (error || !docData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const doc = docData as Pick<DocumentRow, 'storage_key' | 'status'>

  if (doc.status === 'deleted' || doc.status === 'expired') {
    return NextResponse.json({ error: 'gone' }, { status: 410 })
  }

  try {
    const cmd = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: doc.storage_key,
    })

    const r2Res = await r2.send(cmd)
    const bytes = await r2Res.Body?.transformToByteArray()

    if (!bytes) {
      return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
    }

    return new NextResponse(bytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'no-store, no-cache',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve file' }, { status: 500 })
  }
}
