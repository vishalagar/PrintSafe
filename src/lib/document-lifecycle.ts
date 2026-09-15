import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteR2Object } from "@/lib/r2";

/**
 * Computes the ISO timestamp at which a just-viewed document's blob should
 * be purged, or null for TTL=0 (view-once) documents, which are deleted
 * immediately by the caller instead of on a deadline.
 */
export function computeDeleteAfter(ttlAfterView: number): string | null {
  if (ttlAfterView <= 0) return null;
  return new Date(Date.now() + ttlAfterView * 1000).toISOString();
}

export function isPastDeleteDeadline(deleteAfter: string | null): boolean {
  if (!deleteAfter) return false;
  return Date.now() >= new Date(deleteAfter).getTime();
}

/**
 * Lazily purges a 'viewed' document once its ttl_after_view deadline has
 * passed, instead of waiting for the next cron run. Safe to call on every
 * request that reads a document's status/blob — the `.eq("status","viewed")`
 * guard makes the actual delete idempotent, so concurrent callers (e.g. two
 * browser tabs polling /api/status at once) can't race each other.
 *
 * Runs the R2 delete + status update in `after()` so it never delays the
 * response. Returns true if the document is expired (whether or not this
 * call is the one that triggers the delete), so the caller can respond as
 * if the document is already gone.
 */
export function lazyDeleteIfPastDeadline(
  supabase: SupabaseClient,
  doc: { token: string; storage_key: string; status: string; delete_after: string | null },
): boolean {
  if (doc.status !== "viewed" || !isPastDeleteDeadline(doc.delete_after)) {
    return false;
  }

  after(async () => {
    try {
      await deleteR2Object(doc.storage_key);
      await supabase
        .from("documents")
        .update({ status: "deleted" })
        .eq("token", doc.token)
        .eq("status", "viewed"); // guard against a concurrent delete
    } catch (err) {
      console.error(
        "[document-lifecycle] lazy TTL deletion failed:",
        err instanceof Error ? err.message : err,
      );
    }
  });

  return true;
}
