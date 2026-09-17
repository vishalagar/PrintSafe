import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, DocumentRow } from "@/lib/supabase";
import { headR2Object, deleteR2Object } from "@/lib/r2";

// AES-GCM (WebCrypto, 128-bit tag) appends exactly 16 bytes of auth tag to
// the plaintext — see src/lib/crypto.ts encryptFile(). The declared
// x-filesize header at /api/upload time is the plaintext size, so the
// ciphertext object in R2 should be exactly that many bytes larger.
const GCM_TAG_BYTES = 16;

// Small tolerance around the expected ciphertext size so this check catches
// a wildly different payload (the actual threat) without being brittle to
// exact byte-count assumptions. The primary defense is simply "did an object
// land in R2 at all" — this is a secondary sanity check on top of that.
const SIZE_TOLERANCE_BYTES = 64;

// POST /api/upload/confirm
// Body: { token: string }
//
// Called by the client after it has PUT the encrypted ciphertext directly to
// the presigned R2 URL returned by /api/upload. Verifies the object actually
// landed in R2 (HeadObjectCommand) and roughly matches the size declared at
// upload time, then flips the row from "uploading" (confirmed_at IS NULL) to
// confirmed — at which point /api/doc and /api/file will serve it.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const token =
    typeof body === "object" && body !== null && "token" in body
      ? (body as { token?: unknown }).token
      : undefined;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: docData, error: fetchError } = await supabase
    .from("documents")
    .select("id, storage_key, file_size, status, confirmed_at")
    .eq("token", token)
    .single();

  if (fetchError || !docData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const doc = docData as Pick<
    DocumentRow,
    "id" | "storage_key" | "file_size" | "status" | "confirmed_at"
  >;

  // Already confirmed — idempotent success (client retry after a dropped response).
  if (doc.confirmed_at) {
    return NextResponse.json({ success: true });
  }

  if (doc.status !== "pending") {
    return NextResponse.json(
      { error: "Upload is no longer valid" },
      { status: 410 },
    );
  }

  let head: { contentLength: number } | null;
  try {
    head = await headR2Object(doc.storage_key);
  } catch {
    return NextResponse.json(
      { error: "Failed to verify upload" },
      { status: 500 },
    );
  }

  if (!head) {
    return NextResponse.json(
      { error: "Upload not found in storage — please retry." },
      { status: 400 },
    );
  }

  const expectedSize = doc.file_size + GCM_TAG_BYTES;
  const sizeDiff = Math.abs(head.contentLength - expectedSize);
  if (sizeDiff > SIZE_TOLERANCE_BYTES) {
    // Don't leave a mismatched object sitting in R2 for up to an hour
    // waiting on the abandoned-upload cron pass — delete it now. Best
    // effort: the row itself stays 'pending'/unconfirmed either way, so a
    // failed delete here just means cron cleans it up later as usual.
    try {
      await deleteR2Object(doc.storage_key);
    } catch (err) {
      console.error(
        "[upload/confirm] cleanup of mismatched-size object failed:",
        err instanceof Error ? err.message : err,
      );
    }
    return NextResponse.json(
      { error: "Uploaded file size does not match — please retry." },
      { status: 400 },
    );
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", doc.id)
    .is("confirmed_at", null); // guard against a concurrent confirm

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
