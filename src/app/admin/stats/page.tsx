import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getAdminStats } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="shadow-brutal-sm"
      style={{
        background: "var(--surface)",
        border: "2px solid var(--ink)",
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function Breakdown({
  title,
  entries,
}: {
  title: string;
  entries: [string, number][];
}) {
  return (
    <div
      className="shadow-brutal-sm"
      style={{
        background: "var(--surface)",
        border: "2px solid var(--ink)",
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {entries.length === 0 && (
        <div style={{ color: "var(--text-dim)", fontSize: 14 }}>No data</div>
      )}
      {entries.map(([key, count]) => (
        <div
          key={key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            padding: "4px 0",
          }}
        >
          <span style={{ color: "var(--text-mid)" }}>{key}</span>
          <span style={{ fontWeight: 700 }}>{count}</span>
        </div>
      ))}
    </div>
  );
}

async function LoginForm({ error }: { error?: string }) {
  const message =
    error === "invalid"
      ? "Wrong password."
      : error === "rate_limited"
        ? "Too many attempts. Try again in a few minutes."
        : null;

  return (
    <div className="wrap" style={{ paddingTop: 80, maxWidth: 380 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Admin</h1>
      <form action="/api/admin/login" method="POST">
        <input
          type="password"
          name="password"
          placeholder="Admin password"
          autoFocus
          required
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "2px solid var(--ink)",
            borderRadius: 8,
            fontSize: 15,
            marginBottom: 12,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        {message && (
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
            {message}
          </div>
        )}
        <button type="submit" className="btn-primary">
          Sign in
        </button>
      </form>
    </div>
  );
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!(await isValidAdminSession(session))) {
    return <LoginForm error={error} />;
  }

  const stats = await getAdminStats();

  return (
    <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Admin — Stats</h1>
        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            className="btn-ghost"
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            Sign out
          </button>
        </form>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard label="Total documents" value={stats.total} />
        <StatCard label="Uploads today" value={stats.uploadsToday} />
        <StatCard label="Uploads (7d)" value={stats.uploadsThisWeek} />
        <StatCard label="Views today" value={stats.viewsToday} />
        <StatCard
          label="Live storage (R2)"
          value={formatBytes(stats.liveStorageBytes)}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <Breakdown title="By status" entries={Object.entries(stats.byStatus)} />
        <Breakdown
          title="Live docs by file type"
          entries={Object.entries(stats.byFileType)}
        />
        <Breakdown
          title="Live docs by TTL"
          entries={Object.entries(stats.byTtl)}
        />
      </div>
    </div>
  );
}
