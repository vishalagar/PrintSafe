"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { capture } from "@/lib/analytics";
import {
  REPORT_EMAIL_MAX,
  REPORT_MESSAGE_MAX,
  type ReportContext,
  type ReportPage,
  type ReportPayload,
} from "@/lib/report";

// "Report a problem" — the auto-detected nudge (ReportNudge), the manual
// footer link (ReportLink), and the sheet both open (ReportSheet).
// Animations live in globals.css under "ISSUE REPORTER" and switch off with
// prefers-reduced-motion.

const STEP_LABEL: Record<ReportContext["step"], string> = {
  encryption: "encrypting",
  api: "starting upload",
  storage: "storage upload",
  confirm: "confirming upload",
  "key-missing": "reading link",
  "doc-fetch": "loading document",
  "file-fetch": "downloading",
  decrypt: "decrypting",
  "pdf-parse": "opening PDF",
  "pdf-render": "drawing page",
  unknown: "—",
};

// Long enough for the paper plane to fly, short enough not to feel slow.
const MIN_SENDING_MS = 1400;

type SheetState =
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "sent"; ref: string }
  | { kind: "failed"; rateLimited: boolean };

// ── Nudge: shown by a page when a known step fails ──────────────────────────

export function ReportNudge({
  context,
  title = "Hmm, that shouldn’t happen.",
  body = "Report it and I’ll look into it. Your file stays on your device — only the error details are sent.",
}: {
  context: ReportContext;
  title?: string;
  body?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);

  useEffect(() => {
    capture("ReportNudgeShown", { source: context.source, step: context.step });
  }, [context.source, context.step]);

  return (
    <>
      {sentRef && !open ? (
        <div className="ps-nudge-in ps-report-thanks" role="status">
          <CheckIcon />
          <span>
            Report <code>{sentRef}</code> sent. Thanks for flagging it.
          </span>
        </div>
      ) : (
        <div className="ps-nudge-in ps-report-nudge">
          <div className="ps-report-nudge-row">
            <div className="ps-report-nudge-icon" aria-hidden="true">
              <BrokenDocIcon />
            </div>
            <div>
              <p className="ps-report-nudge-title">{title}</p>
              <p className="ps-report-nudge-body">{body}</p>
            </div>
          </div>
          <button
            type="button"
            className="ps-report-btn-dark"
            onClick={() => {
              capture("ReportOpened", { source: context.source, auto: "true" });
              setOpen(true);
            }}
          >
            Report this issue
          </button>
        </div>
      )}
      {open && (
        <ReportSheet
          context={context}
          auto
          onClose={() => setOpen(false)}
          onSent={setSentRef}
        />
      )}
    </>
  );
}

// ── Link: manual report from a footer ───────────────────────────────────────

export function ReportLink({ page }: { page: ReportPage }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="ps-report-link">
        Something not working?{" "}
        <button
          type="button"
          onClick={() => {
            capture("ReportOpened", { source: "manual", auto: "false" });
            setOpen(true);
          }}
        >
          Report a problem
        </button>
      </p>
      {open && (
        <ReportSheet
          context={{ source: "manual", step: "unknown", page }}
          auto={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Sheet ───────────────────────────────────────────────────────────────────

function ReportSheet({
  context,
  auto,
  onClose,
  onSent,
}: {
  context: ReportContext;
  auto: boolean;
  onClose: () => void;
  onSent?: (ref: string) => void;
}) {
  const [state, setState] = useState<SheetState>({ kind: "form" });
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const firstFieldRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const msgId = useId();
  const emailId = useId();

  // Read through refs so the mount effect below runs once — parents pass an
  // inline onClose, and re-running would steal focus back on every render.
  const onCloseRef = useRef(onClose);
  const sendingRef = useRef(false);
  useEffect(() => {
    onCloseRef.current = onClose;
    sendingRef.current = state.kind === "sending";
  });

  // Escape closes (except mid-send); lock page scroll while open.
  useEffect(() => {
    firstFieldRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sendingRef.current) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "sending" });

    const payload: ReportPayload = {
      ...context,
      auto,
      message: message.trim() || undefined,
      email: email.trim() || undefined,
      website: website || undefined,
    };

    try {
      const [res] = await Promise.all([
        fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        new Promise((r) => setTimeout(r, MIN_SENDING_MS)),
      ]);
      if (!res.ok) {
        capture("ReportFailed", { status: String(res.status) });
        setState({ kind: "failed", rateLimited: res.status === 429 });
        return;
      }
      const { ref } = (await res.json()) as { ref: string };
      capture("ReportSent", { source: context.source, step: context.step });
      setState({ kind: "sent", ref });
      onSent?.(ref);
    } catch {
      capture("ReportFailed", { status: "network" });
      setState({ kind: "failed", rateLimited: false });
    }
  }

  const chips = [
    context.step !== "unknown" && `step: ${STEP_LABEL[context.step]}`,
    context.status && `HTTP ${context.status}`,
    context.errorName && `error: ${context.errorName}`,
    context.fileType &&
      `file: ${context.fileType.toUpperCase()}${context.sizeBucket ? ` · ${context.sizeBucket}` : ""}`,
    `page: ${context.page}`,
    "browser & OS",
  ].filter(Boolean) as string[];

  const sheet = (
    <div className="ps-report-root">
      <div
        className="ps-report-overlay"
        onClick={state.kind === "sending" ? undefined : onClose}
      />
      <div
        className="ps-report-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {state.kind === "form" && (
          <form onSubmit={submit} className="ps-report-form">
            <div className="ps-report-head">
              <div>
                <h2 id={titleId} className="ps-report-title">
                  Tell me what happened
                </h2>
                <p className="ps-report-sub">
                  Goes straight to me. I read every one.
                </p>
              </div>
              <button
                type="button"
                className="ps-report-close"
                aria-label="Close"
                onClick={onClose}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="ps-report-attached">
              <p className="ps-report-label-mono">
                <LockIcon /> Attached automatically
              </p>
              <div className="ps-report-chips">
                {chips.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <p className="ps-report-never">
                <strong>Never included:</strong> your file, its name, the link
                or its key.
              </p>
            </div>

            <label htmlFor={msgId} className="ps-report-label">
              What were you trying to do? <span>(optional)</span>
            </label>
            <textarea
              id={msgId}
              ref={firstFieldRef}
              rows={3}
              maxLength={REPORT_MESSAGE_MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Uploading a scanned PDF on mobile data"
              className="ps-report-input"
            />

            <label htmlFor={emailId} className="ps-report-label">
              Email, if you’d like a reply <span>(optional)</span>
            </label>
            <input
              id={emailId}
              type="email"
              maxLength={REPORT_EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="ps-report-input"
            />

            {/* Honeypot — hidden from people and screen readers */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="ps-report-hp"
            />

            <button type="submit" className="ps-report-btn-yellow">
              <SendIcon /> Send report
            </button>
          </form>
        )}

        {state.kind === "sending" && (
          <div className="ps-report-center" aria-live="polite">
            <PaperPlane />
            <h2 id={titleId} className="ps-report-title">
              Sending your report…
            </h2>
            <p className="ps-report-sub">
              Just the error details. Nothing from your file.
            </p>
          </div>
        )}

        {state.kind === "sent" && (
          <div className="ps-report-center" aria-live="polite">
            <div className="ps-stamp">RECEIVED</div>
            <h2 id={titleId} className="ps-report-title">
              Got it — thank you.
            </h2>
            <p className="ps-report-sub ps-report-sub-wide">
              I’ll look into this personally.
              {email.trim() ? " I’ll write back once it’s fixed." : ""}
            </p>
            <code className="ps-report-ref">Ref {state.ref}</code>
            <button
              type="button"
              className="ps-report-btn-yellow"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        )}

        {state.kind === "failed" && (
          <div className="ps-report-center" aria-live="polite">
            <h2 id={titleId} className="ps-report-title">
              {state.rateLimited
                ? "That’s a lot of reports"
                : "Couldn’t send that"}
            </h2>
            <p className="ps-report-sub ps-report-sub-wide">
              {state.rateLimited
                ? "You’ve sent several in the last hour — I’ve got them. Please try again later."
                : "The report didn’t go through. Check your connection and try once more."}
            </p>
            {!state.rateLimited && (
              <button
                type="button"
                className="ps-report-btn-yellow"
                onClick={() => setState({ kind: "form" })}
              >
                Try again
              </button>
            )}
            <button
              type="button"
              className="ps-report-btn-plain"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

// ── Icons (inline stroke SVG, currentColor) ─────────────────────────────────

function BrokenDocIcon() {
  return (
    <svg
      className="ps-wobble"
      width="34"
      height="40"
      viewBox="0 0 40 46"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M5 3h20l10 10v30H5z" fill="var(--surface)" />
      <path d="M25 3v10h10" />
      <path className="ps-crack" d="M12 20l6 5-4 4 7 6" stroke="var(--red)" />
      <path d="M11 38h12" />
    </svg>
  );
}

function PaperPlane() {
  return (
    <svg
      width="260"
      height="170"
      viewBox="0 40 300 170"
      fill="none"
      aria-hidden="true"
      style={{ overflow: "visible" }}
    >
      <path
        className="ps-trail"
        d="M70 170 C 130 160, 190 120, 290 -30"
        stroke="var(--blue)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <g className="ps-fold">
        <rect
          x="44"
          y="110"
          width="56"
          height="72"
          fill="var(--surface)"
          stroke="var(--ink)"
          strokeWidth="2.4"
        />
        <path
          d="M54 128h36M54 140h36M54 152h24"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g className="ps-fly">
        <path
          d="M40 160 L108 132 L78 176 Z"
          fill="var(--surface)"
          stroke="var(--ink)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M108 132 L70 166 L78 176"
          fill="var(--yellow)"
          stroke="var(--ink)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}
