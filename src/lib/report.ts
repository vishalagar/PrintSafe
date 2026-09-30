// Issue reports — the shape shared by the client (src/components/ReportIssue.tsx)
// and the server (src/app/api/report/route.ts).
//
// A report is built from a FIXED WHITELIST of fields. Never pass location.href,
// an Error object, a filename, a token, or anything read from the URL fragment
// into it — the fragment holds the decryption key. See docs/security.md § L.

export const REPORT_SOURCES = ["upload", "viewer", "manual"] as const;

// Where it broke. Upload steps mirror the `reason` values of the UploadError
// analytics event in src/app/page.tsx; viewer steps mirror the stages of the
// viewer's init() in src/app/d/[token]/page.tsx.
export const REPORT_STEPS = [
  // upload
  "encryption",
  "api",
  "storage",
  "confirm",
  // viewer
  "key-missing",
  "doc-fetch",
  "file-fetch",
  "decrypt",
  "pdf-parse",
  "pdf-render",
  // manual report from a footer link
  "unknown",
] as const;

// Route templates only — never a concrete path, which would carry a token.
export const REPORT_PAGES = [
  "/",
  "/share",
  "/d/[token]",
  "/status/[token]",
] as const;

export const REPORT_FILE_TYPES = [
  "pdf",
  "jpg",
  "png",
  "heic",
  "unknown",
] as const;
export const REPORT_SIZE_BUCKETS = ["small", "medium", "large"] as const;
export const REPORT_TTLS = ["view-once", "15min", "30min", "1hr"] as const;

export const REPORT_MESSAGE_MAX = 1000;
export const REPORT_EMAIL_MAX = 254;

export type ReportSource = (typeof REPORT_SOURCES)[number];
export type ReportStep = (typeof REPORT_STEPS)[number];
export type ReportPage = (typeof REPORT_PAGES)[number];

/** What the page knows about the failure — no user input. */
export interface ReportContext {
  source: ReportSource;
  step: ReportStep;
  page: ReportPage;
  /** HTTP status of the failing request, when there was a response. */
  status?: number;
  /** Error class name only (e.g. "TypeError") — never its message. */
  errorName?: string;
  fileType?: (typeof REPORT_FILE_TYPES)[number];
  sizeBucket?: (typeof REPORT_SIZE_BUCKETS)[number];
  ttl?: (typeof REPORT_TTLS)[number];
}

/** The full POST /api/report body. */
export interface ReportPayload extends ReportContext {
  /** True when the app detected the failure and prompted the user. */
  auto: boolean;
  message?: string;
  email?: string;
  /** Honeypot — a hidden input real users never fill in. */
  website?: string;
}

/** Keeps only an Error's class name, and only if it looks like one. */
export function errorNameOf(err: unknown): string | undefined {
  const name = err instanceof Error ? err.name : undefined;
  return name && /^[A-Za-z]{1,40}$/.test(name) ? name : undefined;
}
