/**
 * Shared pdf.js document loading.
 *
 * pdf.js TAKES OWNERSHIP of any TypedArray handed to `getDocument({ data })` —
 * it transfers the buffer to its worker thread, leaving the caller's array
 * detached (`byteLength === 0`). Reusing that array afterwards yields an empty
 * document: pages render blank at the correct dimensions, with no thrown error
 * and nothing on the console.
 *
 * Every caller therefore hands pdf.js a throwaway copy and keeps its own bytes
 * pristine. Parse once and reuse the returned proxy for every page rather than
 * re-parsing per page.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFDocumentProxy = any;

const WORKER_SRC = "/pdf.worker.min.mjs";

/**
 * pdf.js fetches these lazily, at render time, and does NOT bundle them:
 *   wasm/            OpenJPEG for JPEG 2000 ("JPXDecode") images — what
 *                    scanners and iLovePDF-style tools embed — plus qcms for
 *                    ICC colour profiles.
 *   standard_fonts/  The 14 standard fonts when a PDF does not embed them.
 *   cmaps/           CJK character maps.
 *
 * When a URL is missing pdf.js does not throw. The worker logs a warning,
 * skips the object, and resolves the render as a success — so a scanned page
 * that is one JPX image comes out perfectly blank at the right size with no
 * error anywhere. scripts/copy-pdfjs-assets.mjs (postinstall + build) copies
 * them from node_modules/pdfjs-dist into public/pdfjs/, so they always match
 * the installed pdf.js version. Each URL must end with "/" or pdf.js throws.
 */
const PDFJS_ASSET_BASE = "/pdfjs/";
const PDFJS_ASSET_OPTIONS = Object.freeze({
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
});

/**
 * Parse `bytes` into a pdf.js document without consuming the caller's array.
 * @throws if the bytes are not a readable PDF.
 */
export async function loadPdfDocument(
  bytes: Uint8Array,
): Promise<PDFDocumentProxy> {
  if (bytes.byteLength === 0) {
    throw new Error(
      "PDF data is empty — the buffer was already consumed by pdf.js.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  // `.slice()` is the throwaway copy pdf.js is allowed to take ownership of.
  // Passing raw bytes rather than a blob: URL also avoids Safari throwing
  // inside pdf.js's range-request header handling.
  return pdfjsLib.getDocument({
    data: bytes.slice(),
    ...PDFJS_ASSET_OPTIONS,
  }).promise;
}

/**
 * Begin rendering a page into a PRIVATE offscreen canvas.
 *
 * Rendering never touches the on-screen canvas. Callers blit the result across
 * only once `task.promise` resolves, so a render that is cancelled, stalls, or
 * fails can never leave a blank or half-drawn page on screen — the previous
 * page simply stays up.
 *
 * Giving every render its own canvas also makes pdf.js's "Cannot use the same
 * canvas during multiple render() operations" structurally impossible.
 *
 * Note: pdf.js drives long renders through requestAnimationFrame, so
 * `task.promise` does not settle while the tab is hidden. Callers must treat a
 * pending render as normal, not as an error.
 */
export async function startPageRenderOffscreen(
  doc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  task: any;
  canvas: HTMLCanvasElement;
}> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context.");
  return { task: page.render({ canvasContext: context, viewport }), canvas };
}

/** Copy a finished offscreen render onto the visible canvas in one step. */
export function blitToCanvas(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
): void {
  target.width = source.width;
  target.height = source.height;
  const context = target.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context.");
  context.drawImage(source, 0, 0);
}

/** True for the benign error pdf.js throws when a render is cancelled. */
export function isRenderCancelled(e: unknown): boolean {
  return (e as { name?: string })?.name === "RenderingCancelledException";
}

/** Unscaled page size, for working out the scale that fits a CSS width. */
export async function getPageCssWidth(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<number> {
  const page = await doc.getPage(pageNumber);
  return page.getViewport({ scale: 1 }).width;
}
