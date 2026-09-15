// Shared between the upload page (client-side pre-check, for a fast error
// message before encrypting) and /api/upload (the actual server-side
// enforcement). Single source of truth so the two can't silently drift —
// previously each had its own hand-copied allowlist.

export const MAX_FILE_SIZE = 26_214_400; // 25 MB

export type TtlSeconds = 0 | 900 | 1800 | 3600;
// Typed as plain readonly number[] (not a literal tuple) so
// `.includes(someNumber)` at the call site — checking an arbitrary
// runtime value against this allowlist — type-checks without needing a
// cast; ALLOWED_TTLS still only ever holds TtlSeconds values.
export const ALLOWED_TTLS: readonly number[] = [0, 900, 1800, 3600];

export const MIME_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

export const ALLOWED_MIMES = Object.keys(MIME_LABEL);

export const EXPIRY_OPTIONS: { label: string; ttl: TtlSeconds }[] = [
  { label: "View once", ttl: 0 },
  { label: "15 min", ttl: 900 },
  { label: "30 min", ttl: 1800 },
  { label: "1 hour", ttl: 3600 },
];

export const EXPIRY_LABEL: Record<number, string> = {
  0: "View once — deleted immediately",
  900: "15 minutes after first view",
  1800: "30 minutes after first view",
  3600: "1 hour after first view",
};
