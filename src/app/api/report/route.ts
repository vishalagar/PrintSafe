import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { customAlphabet } from "nanoid";
import { checkRateLimit } from "@/lib/redis";
import {
  REPORT_EMAIL_MAX,
  REPORT_FILE_TYPES,
  REPORT_MESSAGE_MAX,
  REPORT_PAGES,
  REPORT_SIZE_BUCKETS,
  REPORT_SOURCES,
  REPORT_STEPS,
  REPORT_TTLS,
  type ReportPayload,
} from "@/lib/report";

// POST /api/report
// Body: ReportPayload (src/lib/report.ts)
//
// A user-submitted issue report. Forwarded to the owner's Telegram chat and
// tagged in Sentry; nothing is stored. Every field is validated against a
// fixed whitelist so no document data, filename, token or key can ride along
// — see docs/security.md § L.

// Distinct characters only (no 0/O, 1/I) so a ref read out by a user is unambiguous.
const newRef = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const MAX_BODY_BYTES = 4096;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export async function POST(req: NextRequest) {
  // 1. Rate limit — per IP, plus a global ceiling so a botnet can't flood the
  // Telegram chat. Both fail closed (checkRateLimit returns false on error).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const [ipOk, globalOk] = await Promise.all([
    checkRateLimit(`report:${ip}`, 5, 3600),
    checkRateLimit("report:global", 200, 86400),
  ]);
  if (!ipOk || !globalOk) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // 2. Parse — small bodies only
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Report too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const report = validate(body);
  if (!report) {
    return NextResponse.json({ error: "Invalid report" }, { status: 400 });
  }

  const ref = `PS-${newRef()}`;

  // 3. Honeypot filled → pretend success so bots learn nothing, deliver nothing.
  if (report.website) {
    return NextResponse.json({ ref });
  }

  // 4. Deliver. Sentry gets tags only — never the free-text message or email.
  Sentry.captureMessage("User issue report", {
    level: "warning",
    tags: {
      report_ref: ref,
      report_source: report.source,
      report_step: report.step,
      report_page: report.page,
      report_auto: String(report.auto),
    },
  });

  const delivered = await sendTelegram(
    formatTelegram(ref, report, req.headers.get("user-agent") ?? ""),
  );
  if (!delivered) {
    return NextResponse.json(
      { error: "Could not send report" },
      { status: 503 },
    );
  }

  return NextResponse.json({ ref });
}

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** Returns a clean ReportPayload, or null if anything is off-whitelist. */
function validate(body: unknown): ReportPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  if (!oneOf(REPORT_SOURCES, b.source)) return null;
  if (!oneOf(REPORT_STEPS, b.step)) return null;
  if (!oneOf(REPORT_PAGES, b.page)) return null;
  if (typeof b.auto !== "boolean") return null;

  const out: ReportPayload = {
    source: b.source,
    step: b.step,
    page: b.page,
    auto: b.auto,
  };

  if (b.status !== undefined) {
    if (
      !Number.isInteger(b.status) ||
      (b.status as number) < 100 ||
      (b.status as number) > 599
    )
      return null;
    out.status = b.status as number;
  }
  if (b.errorName !== undefined) {
    if (
      typeof b.errorName !== "string" ||
      !/^[A-Za-z]{1,40}$/.test(b.errorName)
    )
      return null;
    out.errorName = b.errorName;
  }
  if (b.fileType !== undefined) {
    if (!oneOf(REPORT_FILE_TYPES, b.fileType)) return null;
    out.fileType = b.fileType;
  }
  if (b.sizeBucket !== undefined) {
    if (!oneOf(REPORT_SIZE_BUCKETS, b.sizeBucket)) return null;
    out.sizeBucket = b.sizeBucket;
  }
  if (b.ttl !== undefined) {
    if (!oneOf(REPORT_TTLS, b.ttl)) return null;
    out.ttl = b.ttl;
  }
  if (b.message !== undefined) {
    if (typeof b.message !== "string") return null;
    const message = b.message.trim().slice(0, REPORT_MESSAGE_MAX);
    if (message) out.message = message;
  }
  if (b.email !== undefined) {
    if (typeof b.email !== "string") return null;
    const email = b.email.trim();
    if (email) {
      if (email.length > REPORT_EMAIL_MAX || !EMAIL_RE.test(email)) return null;
      out.email = email;
    }
  }
  if (typeof b.website === "string" && b.website) out.website = b.website;

  return out;
}

// First match wins — order matters (Edge/Samsung/Opera UAs also say "Chrome",
// and Chrome's also says "Safari").
const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/(\d+)/, "Edge"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/OPR\/(\d+)/, "Opera"],
  [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
  [/Version\/(\d+).*Safari/, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Android (\d+)/, "Android"],
  [/(?:iPhone|iPad).* OS (\d+)/, "iOS"],
  [/Windows()/, "Windows"],
  [/Mac OS X()/, "macOS"],
  [/Linux()/, "Linux"],
];

function firstMatch(ua: string, table: [RegExp, string][], fallback: string) {
  for (const [re, label] of table) {
    const m = ua.match(re);
    if (m) return m[1] ? `${label} ${m[1]}` : label;
  }
  return fallback;
}

/** "Chrome 131 · Android 14" — coarse, just enough to reproduce. */
function describeUserAgent(ua: string): string {
  return `${firstMatch(ua, BROWSERS, "Unknown browser")} · ${firstMatch(ua, SYSTEMS, "Unknown OS")}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatTelegram(ref: string, r: ReportPayload, ua: string): string {
  const env = process.env.VERCEL_ENV ?? "local";
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
  const file = [r.fileType, r.sizeBucket, r.ttl].filter(Boolean).join(" · ");

  const lines = [
    `🐞 <b>PrintSafe issue</b> · <code>${ref}</code>`,
    "",
    `<b>Where:</b> ${r.source} → ${r.step} (${r.auto ? "auto-detected" : "reported manually"})`,
    `<b>Page:</b> <code>${r.page}</code>`,
  ];
  if (r.status) lines.push(`<b>HTTP:</b> ${r.status}`);
  if (r.errorName) lines.push(`<b>Error:</b> ${r.errorName}`);
  if (file) lines.push(`<b>File:</b> ${file}`);
  lines.push(`<b>Device:</b> ${escapeHtml(describeUserAgent(ua))}`);
  lines.push(`<b>Version:</b> ${env} @ ${sha}`);
  if (r.message) lines.push("", `<b>User says:</b>`, escapeHtml(r.message));
  if (r.email) lines.push("", `<b>Reply to:</b> ${escapeHtml(r.email)}`);
  return lines.join("\n");
}

async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[report] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
    return false;
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) {
      console.error("[report] Telegram sendMessage failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      "[report] Telegram sendMessage error:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
