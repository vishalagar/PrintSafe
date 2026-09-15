import { createServerSupabaseClient, DocumentRow } from "@/lib/supabase";

export interface AdminStats {
  total: number;
  byStatus: Record<DocumentRow["status"], number>;
  uploadsToday: number;
  uploadsThisWeek: number;
  viewsToday: number;
  liveStorageBytes: number;
  byFileType: Record<string, number>;
  byTtl: Record<string, number>;
}

const STATUSES: DocumentRow["status"][] = [
  "pending",
  "viewed",
  "deleted",
  "expired",
];

function startOfDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = createServerSupabaseClient();
  const todayIso = startOfDayIso();
  const weekAgoIso = daysAgoIso(7);

  const [
    totalRes,
    statusResults,
    uploadsTodayRes,
    uploadsWeekRes,
    viewsTodayRes,
    liveRowsRes,
  ] = await Promise.all([
    supabase.from("documents").select("*", { count: "exact", head: true }),
    Promise.all(
      STATUSES.map((status) =>
        supabase
          .from("documents")
          .select("*", { count: "exact", head: true })
          .eq("status", status),
      ),
    ),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .gte("created_at", todayIso),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgoIso),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .gte("viewed_at", todayIso),
    supabase
      .from("documents")
      .select("file_size, mime_type, ttl_after_view")
      .in("status", ["pending", "viewed"]),
  ]);

  const byStatus = STATUSES.reduce(
    (acc, status, i) => {
      acc[status] = statusResults[i].count ?? 0;
      return acc;
    },
    {} as Record<DocumentRow["status"], number>,
  );

  const liveRows =
    (liveRowsRes.data as Pick<
      DocumentRow,
      "file_size" | "mime_type" | "ttl_after_view"
    >[]) ?? [];

  const liveStorageBytes = liveRows.reduce((sum, r) => sum + r.file_size, 0);

  const byFileType = liveRows.reduce(
    (acc, r) => {
      acc[r.mime_type] = (acc[r.mime_type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const byTtl = liveRows.reduce(
    (acc, r) => {
      const key = r.ttl_after_view === 0 ? "view-once" : `${r.ttl_after_view}s`;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    total: totalRes.count ?? 0,
    byStatus,
    uploadsToday: uploadsTodayRes.count ?? 0,
    uploadsThisWeek: uploadsWeekRes.count ?? 0,
    viewsToday: viewsTodayRes.count ?? 0,
    liveStorageBytes,
    byFileType,
    byTtl,
  };
}
