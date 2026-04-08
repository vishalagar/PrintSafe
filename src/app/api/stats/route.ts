import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const SEED_COUNT = 1000;

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { count, error } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true });

    if (error || count === null) {
      return NextResponse.json({ count: SEED_COUNT });
    }

    return NextResponse.json(
      { count: SEED_COUNT + count },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json({ count: SEED_COUNT });
  }
}
