"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { capture, mimeToFileType } from "@/lib/analytics";
import ThemeToggle from "@/components/ThemeToggle";

type ViewState =
  | "loading"
  | "decrypting"
  | "ready"
  | "already-opened"
  | "deleted"
  | "error";

export default function DocumentViewer() {
  const params = useParams();
  const token = params.token as string;

  const [viewState, setViewState] = useState<ViewState>("loading");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("");
  const [ttlAfterView, setTtlAfterView] = useState(1800);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current || !token) return;
    initRef.current = true;

    async function init() {
      const keyStr = window.location.hash.slice(1);
      if (!keyStr) {
        setErrorMsg("Missing decryption key — the link may be malformed.");
        setViewState("error");
        return;
      }

      try {
        const res = await fetch(`/api/doc/${token}`);
        if (res.status === 410) {
          setViewState("already-opened");
          return;
        }
        if (!res.ok) {
          throw new Error("Document not found or unavailable.");
        }

        const { iv, mimeType: mime, ttlAfterView: ttl } = await res.json();
        setMimeType(mime);
        setTtlAfterView(ttl ?? 1800);
        setViewState("decrypting");

        // Fetch ciphertext via API proxy — same-origin, no CORS issues
        const cipherRes = await fetch(`/api/file/${token}`);
        if (!cipherRes.ok) throw new Error("Failed to retrieve document data.");
        const ciphertext = await cipherRes.arrayBuffer();

        // Decrypt in browser — key never leaves client
        const { base64urlToKey, decryptFile } = await import("@/lib/crypto");
        const key = await base64urlToKey(keyStr);
        const plaintext = await decryptFile(ciphertext, key, iv);

        // Convert HEIC/HEIF → JPEG for cross-browser display
        // Adding .heic to the file input's accept attribute tells iOS to stop
        // auto-converting to JPEG — raw HEIC arrives but Chrome/Firefox can't
        // render it. Convert here so all browsers see a standard JPEG blob.
        let displayMime = mime;
        let displayBytes: ArrayBuffer = plaintext;

        if (mime === "image/heic" || mime === "image/heif") {
          try {
            const heic2any = (await import("heic2any")).default;
            const converted = (await heic2any({
              blob: new Blob([plaintext], { type: mime }),
              toType: "image/jpeg",
              quality: 0.92,
            })) as Blob;
            displayBytes = await converted.arrayBuffer();
            displayMime = "image/jpeg";
          } catch {
            // Conversion failed — fall through with original bytes
            // Safari can still display native HEIC natively
          }
        }

        setMimeType(displayMime);
        const blob = new Blob([displayBytes], { type: displayMime });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setViewState("ready");
        capture("DocumentViewed", { fileType: mimeToFileType(mime) });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to load document.",
        );
        setViewState("error");
      }
    }

    init();

    // Cleanup blob URL on unmount
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll status every 5s while document is open — detects if sender deletes it remotely.
  // Uses /api/status (read-only, no side effects). Functional setBlobUrl form revokes
  // the old URL without needing blobUrl in the dependency array.
  useEffect(() => {
    if (viewState !== "ready" || !token) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${token}`);
        if (!res.ok) return;
        const { status } = await res.json();
        if (status === "deleted" || status === "expired") {
          setBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setViewState("deleted");
        }
      } catch {
        // network hiccup — keep polling
      }
    }, 5000);
    return () => clearInterval(id);
  }, [viewState, token]);

  const ttlLabel =
    ttlAfterView === 0
      ? "immediately after you close this tab"
      : ttlAfterView < 3600
        ? `${Math.round(ttlAfterView / 60)} minutes after you close this tab`
        : "1 hour after you close this tab";

  // ── Already opened ──
  if (viewState === "already-opened") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--red-dim)",
            border: "2px solid var(--red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          🔒
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 900,
            fontSize: "clamp(24px, 4vw, 36px)",
            color: "var(--text)",
            textShadow: "2px 3px 0 var(--stamp)",
            letterSpacing: "-0.5px",
          }}
        >
          Document already opened
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--text)",
            maxWidth: 400,
            lineHeight: 1.7,
            fontWeight: 500,
          }}
        >
          This link is one-time use only. For your protection, the document
          cannot be opened again.
        </p>
        <a
          href="/"
          style={{
            marginTop: 8,
            padding: "12px 24px",
            background: "var(--yellow)",
            border: "2px solid var(--ink)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            color: "var(--ink)",
            textDecoration: "none",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          Upload a new document
        </a>
      </div>
    );
  }

  // ── Deleted remotely ──
  if (viewState === "deleted") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--red-dim)",
            border: "2px solid var(--red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          🗑
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 900,
            fontSize: "clamp(24px, 4vw, 36px)",
            color: "var(--text)",
            textShadow: "2px 3px 0 var(--stamp)",
            letterSpacing: "-0.5px",
          }}
        >
          Document deleted
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "var(--text)",
            maxWidth: 400,
            lineHeight: 1.7,
            fontWeight: 500,
          }}
        >
          The sender has deleted this document. It is no longer available.
        </p>
        <a
          href="/"
          style={{
            marginTop: 8,
            padding: "12px 24px",
            background: "var(--yellow)",
            border: "2px solid var(--ink)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            color: "var(--ink)",
            textDecoration: "none",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          Upload a new document
        </a>
      </div>
    );
  }

  // ── Error ──
  if (viewState === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: "var(--red-dim)",
            border: "2px solid var(--red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            marginBottom: 8,
          }}
        >
          ⚠
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 900,
            fontSize: 28,
            color: "var(--text)",
            textShadow: "2px 3px 0 var(--stamp)",
          }}
        >
          Unable to load document
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text)",
            maxWidth: 360,
            lineHeight: 1.7,
          }}
        >
          {errorMsg}
        </p>
        <a
          href="/"
          style={{
            marginTop: 8,
            padding: "12px 24px",
            background: "var(--yellow)",
            border: "2px solid var(--ink)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 14,
            color: "var(--ink)",
            textDecoration: "none",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          ← Back to home
        </a>
      </div>
    );
  }

  // ── Loading / Decrypting ──
  if (viewState === "loading" || viewState === "decrypting") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid var(--spinner-track)",
            borderTopColor: "var(--ink)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <p style={{ fontSize: 14, color: "var(--text)", fontWeight: 600 }}>
          {viewState === "decrypting" ? "Decrypting document…" : "Loading…"}
        </p>
      </div>
    );
  }

  // ── Ready ──
  const isPDF = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  // Tiled diagonal watermark — makes screenshots traceable to the specific token
  // Detect current theme at render time (client-only, viewState === 'ready' guarantees client)
  const isDark = document.documentElement.dataset.theme === "dark";
  const watermarkFill = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const watermarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="160" y="90" fill="${watermarkFill}" font-size="13" font-family="monospace" transform="rotate(-30,160,90)" text-anchor="middle" font-weight="600">PrintSafe · ${token.slice(-8)} · Print only</text></svg>`;
  const watermarkUrl = `data:image/svg+xml;utf8,${encodeURIComponent(watermarkSvg)}`;

  // Renders each PDF page to canvas at 2× scale, then prints via iframe.
  // Raw PDF blob is never exposed in a navigable tab with a native Download button.
  // "Save as PDF" output becomes a rasterized image copy rather than the original vector PDF.
  async function printPDFViaCanvas(url: string) {
    setIsPrinting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfjsLib: any = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument({ url }).promise;
      const dataUrls: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({
          canvasContext: canvas.getContext("2d")!,
          viewport: vp,
        }).promise;
        dataUrls.push(canvas.toDataURL("image/png"));
      }
      setIsPrinting(false);

      const frame = document.createElement("iframe");
      frame.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none";
      document.body.appendChild(frame);
      const cleanup = () => {
        if (document.body.contains(frame)) document.body.removeChild(frame);
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);

      const date = new Date().toLocaleDateString();
      const footer = `PrintSafe — authorised print copy · ${token.slice(-8)} · ${date}`;
      const imgHtml = dataUrls
        .map(
          (src, idx) =>
            `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;page-break-after:${idx < dataUrls.length - 1 ? "always" : "avoid"}"><img src="${src}" style="max-width:100%;max-height:calc(100vh - 50px);object-fit:contain;display:block"></div>`,
        )
        .join("");

      const iframeDoc = frame.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { margin: 10mm; size: auto; }
        html, body { width: 100%; background: #fff; }
        .footer { font-family: monospace; font-size: 10px; color: #666; text-align: center; margin-top: 8px; }
      </style></head><body>${imgHtml}<div class="footer">${footer}</div></body></html>`);
      iframeDoc.close();
      setTimeout(() => {
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
      }, 100);
    } catch {
      setIsPrinting(false);
    }
  }

  function handlePrint() {
    if (!blobUrl || isPrinting) return;
    capture("DocumentPrinted", { fileType: mimeToFileType(mimeType) });

    if (isPDF) {
      printPDFViaCanvas(blobUrl);
      return;
    }

    // Image: write a custom page so the image always fills exactly one printed page
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none";
    document.body.appendChild(frame);
    const cleanup = () => {
      if (document.body.contains(frame)) document.body.removeChild(frame);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      @page { margin: 0; size: auto; }
      html, body { width: 100%; height: 100%; background: #fff; }
      body { display: flex; align-items: center; justify-content: center; }
      img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
    </style></head><body>
      <img src="${blobUrl}" onload="window.print()">
    </body></html>`);
    doc.close();
  }

  return (
    // position: relative + zIndex: 1 ensures content stacks above the body::before grid overlay (fixed, z-index: 0)
    <div
      style={{
        minHeight: "100vh",
        paddingBottom: 80,
        position: "relative",
        zIndex: 1,
        userSelect: "none",
      }}
    >
      {/* Tiled watermark — fixed overlay, pointer-events off, hidden in print */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 500,
          backgroundImage: `url("${watermarkUrl}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "320px 180px",
        }}
      />

      {/* Amber security banner */}
      <div
        className="no-print"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--amber-banner-bg)",
          borderBottom: "2px solid var(--amber-banner-border)",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--amber-banner-text)",
        }}
      >
        <span>⚠ This document will be deleted {ttlLabel}</span>
        <ThemeToggle />
      </div>

      {/* Document render area */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        {isPDF && blobUrl ? (
          <PDFViewer blobUrl={blobUrl} />
        ) : isImage && blobUrl ? (
          <div style={{ textAlign: "center" }}>
            <img
              src={blobUrl}
              alt="Document"
              style={{
                maxWidth: "100%",
                userSelect: "none",
                pointerEvents: "none",
                display: "block",
                margin: "0 auto",
              }}
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
            />
          </div>
        ) : null}
      </div>

      {/* Sticky print button */}
      <div
        className="no-print"
        style={{ position: "fixed", bottom: 24, right: 24, zIndex: 200 }}
      >
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          style={{
            padding: "14px 22px",
            background: isPrinting ? "var(--surface2)" : "var(--yellow)",
            border: "2px solid var(--ink)",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 15,
            cursor: isPrinting ? "not-allowed" : "pointer",
            boxShadow: "var(--shadow)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--ink)",
            opacity: isPrinting ? 0.7 : 1,
          }}
        >
          {isPrinting ? (
            <>
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid var(--spinner-track)",
                  borderTopColor: "var(--ink)",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  flexShrink: 0,
                }}
              />
              Preparing print…
            </>
          ) : (
            "🖨 Print"
          )}
        </button>
      </div>
    </div>
  );
}

// Lazy-loaded PDF viewer — avoids SSR issues with react-pdf
function PDFViewer({ blobUrl }: { blobUrl: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ReactPDF, setReactPDF] = useState<any>(null);
  const [numPages, setNumPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    import("react-pdf").then((mod) => {
      // Serve worker locally from public/ — CDN not reliable for pdfjs v5
      mod.pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      setReactPDF(mod);
    });
  }, []);

  if (!ReactPDF) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: "3px solid var(--spinner-track)",
            borderTopColor: "var(--ink)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
      </div>
    );
  }

  const { Document, Page } = ReactPDF;
  const pageWidth =
    typeof window !== "undefined" ? Math.min(window.innerWidth - 48, 860) : 860;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Document
        file={blobUrl}
        onLoadSuccess={({ numPages: n }: { numPages: number }) =>
          setNumPages(n)
        }
        loading={
          <div
            style={{ display: "flex", justifyContent: "center", padding: 48 }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid var(--spinner-track)",
                borderTopColor: "var(--ink)",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </div>
        }
      >
        <Page
          pageNumber={currentPage}
          width={pageWidth}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>

      {numPages > 1 && (
        <div
          className="no-print"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--surface)",
            border: "2px solid var(--ink)",
            borderRadius: 10,
            padding: "8px 16px",
            boxShadow: "var(--shadow-xs)",
          }}
        >
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "2px solid var(--ink)",
              background:
                currentPage <= 1 ? "var(--surface2)" : "var(--yellow)",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 16,
              opacity: currentPage <= 1 ? 0.5 : 1,
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              border: "2px solid var(--ink)",
              background:
                currentPage >= numPages ? "var(--surface2)" : "var(--yellow)",
              cursor: currentPage >= numPages ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 16,
              opacity: currentPage >= numPages ? 0.5 : 1,
            }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
