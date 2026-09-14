import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, DocumentRow } from "@/lib/supabase";
import { deleteR2Object } from "@/lib/r2";
import { trackServerEvent } from "@/lib/analytics-server";

// GET/POST /api/cron/cleanup
// Purges expired (never-opened) and stale viewed docs from R2.
// Protected by CRON_SECRET — call from Vercel Cron (GET) or external scheduler (POST).

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const now = new Date().toISOString();
  let purged = 0;
  let failed = 0;

  // ── 1. Expired: pending docs past their expires_at ──────────────────
  const { data: expiredDocs } = await supabase
    .from("documents")
    .select("id, token, storage_key")
    .eq("status", "pending")
    .lt("expires_at", now)
    .limit(100);

  if (expiredDocs) {
    for (const doc of expiredDocs as Pick<
      DocumentRow,
      "id" | "token" | "storage_key"
    >[]) {
      try {
        await deleteR2Object(doc.storage_key);
        await supabase
          .from("documents")
          .update({ status: "expired" })
          .eq("id", doc.id);
        purged++;
        void trackServerEvent("DocumentExpired");
      } catch {
        failed++;
      }
    }
  }

  // ── 2. Stale viewed: viewed docs past their ttl_after_view ──────────
  // viewed_at + ttl_after_view < now
  // Supabase doesn't support computed column filters easily,
  // so fetch viewed docs and check in code.
  const { data: viewedDocs } = await supabase
    .from("documents")
    .select("id, token, storage_key, viewed_at, ttl_after_view")
    .eq("status", "viewed")
    .limit(100);

  if (viewedDocs) {
    for (const doc of viewedDocs as Pick<
      DocumentRow,
      "id" | "token" | "storage_key" | "viewed_at" | "ttl_after_view"
    >[]) {
      if (!doc.viewed_at) continue;
      const deadline =
        new Date(doc.viewed_at).getTime() + doc.ttl_after_view * 1000;
      if (Date.now() < deadline) continue;

      try {
        await deleteR2Object(doc.storage_key);
        await supabase
          .from("documents")
          .update({ status: "deleted" })
          .eq("id", doc.id);
        purged++;
        void trackServerEvent("DocumentDeleted");
      } catch {
        failed++;
      }
    }
  }

  // ── 3. Abandoned uploads: presigned URL issued but never confirmed ──
  // (client never PUT the ciphertext, or PUT succeeded but /api/upload/confirm
  // was never called). These rows never became real documents, so they're
  // deleted outright rather than transitioned to another status. Best-effort
  // R2 delete first — the object frequently never existed at all.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: abandonedDocs } = await supabase
    .from("documents")
    .select("id, token, storage_key")
    .eq("status", "pending")
    .is("confirmed_at", null)
    .lt("created_at", oneHourAgo)
    .limit(100);

  if (abandonedDocs) {
    for (const doc of abandonedDocs as Pick<
      DocumentRow,
      "id" | "token" | "storage_key"
    >[]) {
      try {
        await deleteR2Object(doc.storage_key);
      } catch {
        // best-effort — the object frequently never existed
      }

      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (deleteError) {
        failed++;
      } else {
        purged++;
        void trackServerEvent("UploadAbandoned");
      }
    }
  }

  return NextResponse.json({ purged, failed, timestamp: now });
}
