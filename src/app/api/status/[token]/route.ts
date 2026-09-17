import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, DocumentRow } from "@/lib/supabase";
import { lazyDeleteIfPastDeadline } from "@/lib/document-lifecycle";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  // Next.js 15: params is a Promise
  const { token } = await context.params;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: docData, error: fetchError } = await supabase
    .from("documents")
    .select(
      "token, storage_key, status, file_name, file_size, mime_type, created_at, viewed_at, expires_at, ttl_after_view, confirmed_at, delete_after",
    )
    .eq("token", token)
    .single();

  if (fetchError || !docData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const doc = docData as Pick<
    DocumentRow,
    | "token"
    | "storage_key"
    | "status"
    | "file_name"
    | "file_size"
    | "mime_type"
    | "created_at"
    | "viewed_at"
    | "expires_at"
    | "ttl_after_view"
    | "confirmed_at"
    | "delete_after"
  >;

  // Unconfirmed uploads (presigned PUT never completed) don't exist yet as far as any client is concerned
  if (doc.status === "pending" && !doc.confirmed_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // TTL deadline already passed but cron hasn't run yet — report (and lazily
  // trigger) the deletion now instead of showing a stale "Viewed" status
  // with a countdown stuck at 00:00.
  const isExpiredByTtl = lazyDeleteIfPastDeadline(supabase, doc);

  return NextResponse.json({
    status: isExpiredByTtl ? "deleted" : doc.status,
    fileName: doc.file_name,
    fileSize: doc.file_size,
    mimeType: doc.mime_type,
    createdAt: doc.created_at,
    viewedAt: doc.viewed_at,
    expiresAt: doc.expires_at,
    ttlAfterView: doc.ttl_after_view,
  });
}
