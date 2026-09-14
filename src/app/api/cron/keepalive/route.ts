import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { redis } from "@/lib/redis";

// GET/POST /api/cron/keepalive
// Pings Supabase and Upstash Redis daily so free-tier inactivity
// policies don't pause/delete the project or the database.
// Protected by CRON_SECRET — call from Vercel Cron (GET) or external scheduler (POST).

export async function GET(req: NextRequest) {
  return handleKeepalive(req);
}

export async function POST(req: NextRequest) {
  return handleKeepalive(req);
}

async function handleKeepalive(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const timestamp = new Date().toISOString();

  const [supabaseResult, redisResult] = await Promise.allSettled([
    supabase.from("documents").select("id").limit(1),
    redis.set("keepalive:last-ping", timestamp),
  ]);

  return NextResponse.json({
    supabase:
      supabaseResult.status === "fulfilled"
        ? "ok"
        : supabaseResult.reason?.message,
    redis:
      redisResult.status === "fulfilled" ? "ok" : redisResult.reason?.message,
    timestamp,
  });
}
