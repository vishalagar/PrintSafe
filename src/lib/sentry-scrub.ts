import type { ErrorEvent } from "@sentry/nextjs";

// Defense-in-depth on top of the SDK's default sendDefaultPii:false — strips
// cookie/set-cookie headers so a session token can never end up in an error report.
export function scrubCookies(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (key.toLowerCase().includes("cookie")) {
          delete event.request.headers[key];
        }
      }
    }
  }
  return event;
}
