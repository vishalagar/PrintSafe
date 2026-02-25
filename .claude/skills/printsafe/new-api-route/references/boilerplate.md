# PrintSafe API Route Boilerplate

Copy-paste templates for every route type. Replace `// TODO` comments only — do not remove security primitives.

---

## `personal-route` — Personal Mode (no auth)

Use for: `/api/upload`, `/api/doc/[token]`, `/api/status/[token]`

```ts
// src/app/api/<route>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { r2 } from '@/lib/r2';
import { rateLimit } from '@/lib/redis';

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (required for all personal-mode routes)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1';
  const { success } = await rateLimit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    // TODO: Parse and validate request body / formData

    // 2. R2 upload — key MUST be an opaque UUID, never the original filename
    const storageKey = crypto.randomUUID();
    await r2.upload(storageKey, /* ciphertext buffer */, /* mimeType */);

    // 3. Persist metadata to Supabase (ciphertext only — NO decryption keys)
    const token = crypto.randomUUID().replace(/-/g, '');
    const deleteToken = crypto.randomUUID().replace(/-/g, '');

    const { error } = await supabaseAdmin.from('documents').insert({
      token,
      delete_token: deleteToken,
      storage_key: storageKey,
      file_name: /* original name from client */,
      file_size: /* byte count */,
      mime_type: /* mime type */,
      iv: /* base64 IV from client */,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      ip_hash: /* SHA-256 of IP, not raw IP */,
    });
    if (error) throw error;

    // 4. Return token + delete_token — NEVER return the R2 key or decryption key
    return NextResponse.json({ token, deleteToken });
  } catch {
    // Generic error — no internal details
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
```

---

## `commercial-route` — Commercial Mode (auth required)

Use for: `/api/shop/*`, `/api/shop/job/*`

```ts
// src/app/api/shop/<route>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { r2 } from '@/lib/r2';

export async function POST(req: NextRequest) {
  // 1. Verify Supabase JWT — required for ALL commercial routes
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // TODO: Extract shopId / jobId from route params or body
    // TODO: Verify user owns the shop (RLS or explicit check)

    // TODO: Route-specific logic here

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
```

---

## `cron-route` — Cron / Internal Job

Use for: `/api/cron/cleanup`, `/api/cron/expire`

```ts
// src/app/api/cron/<job>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { r2 } from '@/lib/r2';

export async function GET(req: NextRequest) {
  // 1. Verify CRON_SECRET — protects the endpoint from public calls
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Example: expire documents past their TTL
    const { data: expired } = await supabaseAdmin
      .from('documents')
      .select('id, storage_key')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    if (!expired?.length) return NextResponse.json({ deleted: 0 });

    // Delete from R2 first, then mark DB
    await Promise.all(expired.map(doc => r2.delete(doc.storage_key)));

    const { error } = await supabaseAdmin
      .from('documents')
      .update({ status: 'expired' })
      .in('id', expired.map(d => d.id));

    if (error) throw error;

    return NextResponse.json({ deleted: expired.length });
  } catch {
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
```

---

## `src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Service-role client — server-side only, NEVER expose to browser
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // ⚠️ No NEXT_PUBLIC_ prefix
  { auth: { persistSession: false } }
);
```

---

## `src/lib/r2.ts`

```ts
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

export const r2 = {
  /** Upload a buffer. Key must be an opaque UUID — never the original filename. */
  async upload(key: string, body: Buffer | Uint8Array, contentType: string) {
    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  },

  /** Permanently delete a blob. Call before marking DB status = 'deleted'. */
  async delete(key: string) {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  },

  /**
   * Generate a pre-signed GET URL (default: 1 hour).
   * This is the ONLY way to serve blobs — bucket has no public access.
   */
  async presign(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  },
};
```

---

## `src/lib/redis.ts`

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 10 requests per minute per IP for personal-mode routes
export const rateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: false,
}).limit;
```

---

## Notes

- `database.types.ts` is generated by: `supabase gen types typescript --local > src/lib/database.types.ts`
- Install required packages: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @supabase/supabase-js @upstash/ratelimit @upstash/redis`
- The `iv` field in the DB stores the AES-GCM initialization vector (base64) sent by the client — it is NOT the decryption key
- Never log `req.body` on upload routes — it may contain the encrypted blob metadata
