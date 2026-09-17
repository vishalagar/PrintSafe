import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Applies to every route. No CSP here — the app loads Turnstile, PostHog,
// and Sentry from third-party origins and a strict CSP needs per-script
// nonces to stay safe with those in place; do that as a dedicated pass
// with a real browser test, not a drive-by header add.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        // The document viewer decrypts and renders sensitive content — it
        // must never be embeddable in another site's iframe (clickjacking).
        source: "/d/:token*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
