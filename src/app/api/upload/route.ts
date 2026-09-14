import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createHash } from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getPresignedUploadUrl } from "@/lib/r2";
import { checkRateLimit } from "@/lib/redis";

const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];

const MAX_FILE_SIZE = 26_214_400; // 25 MB

const ALLOWED_TTLS = [0, 900, 1800, 3600];

// Presigned PUT URL expiry — generous enough for a slow connection to finish
// uploading up to 25 MB before the URL expires.
const UPLOAD_URL_EXPIRES_IN = 300; // 5 minutes

// Ciphertext never touches this function's body — Vercel serverless functions
// cap request bodies at ~4.5 MB, well under the app's 25 MB file limit. This
// route only issues a presigned R2 PUT URL; the browser uploads ciphertext
// directly to R2, then calls /api/upload/confirm once the PUT succeeds.
export async function POST(req: NextRequest) {
  // 1. Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";

  let allowed: boolean;
  try {
    allowed = await checkRateLimit(ip, 10, 3600);
  } catch {
    allowed = false; // fail closed
  }

  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 2. CAPTCHA verification (skipped if secret key not configured — safe for local dev)
  if (process.env.TURNSTILE_SECRET_KEY) {
    const captchaToken = req.headers.get("x-captcha-token") ?? "";
    const verifyRes = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: captchaToken,
        }),
      },
    );
    const { success } = (await verifyRes.json()) as { success: boolean };
    if (!success) {
      return NextResponse.json(
        { error: "CAPTCHA verification failed" },
        { status: 400 },
      );
    }
  }

  // 3. Read metadata from headers — no body is read on this request
  const iv = req.headers.get("x-iv");
  const fileNameRaw = req.headers.get("x-filename");
  const fileSizeRaw = req.headers.get("x-filesize");
  const mimeType = req.headers.get("x-mimetype");
  const ttlAfterViewRaw = req.headers.get("x-ttl");

  if (!iv || !fileNameRaw || !fileSizeRaw || !mimeType || !ttlAfterViewRaw) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const fileName = decodeURIComponent(fileNameRaw);
  const fileSize = parseInt(fileSizeRaw, 10);
  const ttlAfterView = parseInt(ttlAfterViewRaw, 10);

  if (!ALLOWED_MIMES.includes(mimeType)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  if (isNaN(fileSize) || fileSize > MAX_FILE_SIZE || fileSize <= 0) {
    return NextResponse.json({ error: "File too large" }, { status: 400 });
  }

  if (isNaN(ttlAfterView) || !ALLOWED_TTLS.includes(ttlAfterView)) {
    return NextResponse.json({ error: "Invalid TTL" }, { status: 400 });
  }

  // Sanitize fileName — strip path components, keep only the base name
  const safeFileName =
    fileName
      .replace(/[^a-zA-Z0-9._\-\s]/g, "")
      .trim()
      .slice(0, 255) || "document";

  // 4. Generate identifiers — storageKey is always an opaque UUID
  const storageKey = crypto.randomUUID();
  const token = nanoid(21);
  const deleteToken = nanoid(21);

  // 5. Hash IP — store only the hash, never the raw IP
  const ipHash = createHash("sha256").update(ip).digest("hex");

  // 6. Insert the document row up front, in an unconfirmed state
  // (confirmed_at IS NULL). No R2 object exists yet — the client hasn't
  // uploaded ciphertext at this point, only requested a place to put it.
  // /api/upload/confirm flips confirmed_at once the PUT is verified; the
  // cron cleanup job purges rows that never get confirmed.
  const supabase = createServerSupabaseClient();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: dbError } = await supabase.from("documents").insert({
    token,
    delete_token: deleteToken,
    storage_key: storageKey,
    file_name: safeFileName,
    file_size: fileSize,
    mime_type: mimeType,
    status: "pending",
    iv,
    expires_at: expiresAt,
    ttl_after_view: ttlAfterView,
    ip_hash: ipHash,
    confirmed_at: null,
  });

  if (dbError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // 7. Presign a PUT URL for the browser to upload ciphertext directly to R2
  let uploadUrl: string;
  try {
    uploadUrl = await getPresignedUploadUrl(
      storageKey,
      "application/octet-stream",
      UPLOAD_URL_EXPIRES_IN,
    );
  } catch {
    // Best-effort cleanup of the row we just inserted — nothing was ever
    // written to R2, so there's no blob to clean up.
    await supabase.from("documents").delete().eq("token", token);
    return NextResponse.json(
      { error: "Failed to prepare upload" },
      { status: 500 },
    );
  }

  return NextResponse.json({ token, deleteToken, uploadUrl });
}
