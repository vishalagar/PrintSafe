import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient, DocumentRow } from "@/lib/supabase";
import { deleteR2Object } from "@/lib/r2";
import { checkRateLimit } from "@/lib/redis";
import { lazyDeleteIfPastDeadline } from "@/lib/document-lifecycle";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Per-token cap on ciphertext fetches. A legitimate viewer fetches this once
// (occasionally twice, on a retry); this only exists to stop someone who
// holds a still-'viewed'-and-unexpired link from re-downloading the blob in
// a loop and running up R2/egress costs before the TTL deletes it.
const FILE_FETCH_LIMIT = 20;
const FILE_FETCH_WINDOW_SECONDS = 300;

// Separate R2 client instance for streaming — same config as r2.ts
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

type RouteContext = {
  params: Promise<{ token: string }>;
};

// Proxy the encrypted ciphertext from R2 to the browser.
// Avoids CORS issues with direct R2 presigned URL fetches.
// The blob is encrypted — key never touches this server.
export async function GET(req: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let allowed: boolean;
  try {
    allowed = await checkRateLimit(
      `file:${token}`,
      FILE_FETCH_LIMIT,
      FILE_FETCH_WINDOW_SECONDS,
    );
  } catch {
    allowed = false; // fail closed
  }
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = createServerSupabaseClient();

  const { data: docData, error } = await supabase
    .from("documents")
    .select(
      "token, storage_key, status, ttl_after_view, confirmed_at, delete_after",
    )
    .eq("token", token)
    .single();

  if (error || !docData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const doc = docData as Pick<
    DocumentRow,
    | "token"
    | "storage_key"
    | "status"
    | "ttl_after_view"
    | "confirmed_at"
    | "delete_after"
  >;

  // Unconfirmed upload — no verified object in R2 yet (or the upload was
  // abandoned). Treat like a nonexistent document rather than attempting to
  // proxy a blob that may not exist.
  if (doc.status === "pending" && !doc.confirmed_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (doc.status === "deleted" || doc.status === "expired") {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }

  // TTL deadline already passed (e.g. viewer left the tab open past the
  // "30 min after first view" window) but the daily cron hasn't run yet —
  // don't keep serving ciphertext for a document that should be gone.
  if (lazyDeleteIfPastDeadline(supabase, doc)) {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }

  try {
    const cmd = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: doc.storage_key,
    });

    const r2Res = await r2.send(cmd);
    const bytes = await r2Res.Body?.transformToByteArray();

    if (!bytes) {
      return NextResponse.json(
        { error: "File not found in storage" },
        { status: 404 },
      );
    }

    // Use ArrayBuffer.slice() to get a fresh ArrayBuffer with only the ciphertext bytes.
    // bytes.buffer is the Node.js memory pool (byteLength up to 8192) when Buffer.concat
    // uses the pool for small files. bytes.byteOffset marks where the real data starts.
    // Sending bytes.buffer directly would transmit pool garbage instead of the ciphertext,
    // causing AES-GCM decryption to fail on the client for small files (< ~4 KB).
    const safeBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const response = new NextResponse(safeBuffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store, no-cache",
      },
    });

    // TTL=0 ("view once") — delete immediately after serving, don't wait for cron
    if (doc.ttl_after_view === 0) {
      after(async () => {
        try {
          await deleteR2Object(doc.storage_key);
          await supabase
            .from("documents")
            .update({ status: "deleted" })
            .eq("token", token);
        } catch (err) {
          console.error(
            "[file] TTL=0 immediate deletion failed:",
            err instanceof Error ? err.message : err,
          );
        }
      });
    }

    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to retrieve file" },
      { status: 500 },
    );
  }
}
