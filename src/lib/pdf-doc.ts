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
  return pdfjsLib.getDocument({ data: bytes.slice() }).promise;
}

/**
 * Start rendering one page of an already-parsed document into `canvas`, sizing
 * the canvas to the page. `scale` is a device-pixel multiplier.
 *
 * Returns the pdf.js RenderTask. pdf.js refuses to run two renders against the
 * same canvas concurrently ("Cannot use the same canvas during multiple
 * render() operations"), and React re-runs effects (twice over, under
 * StrictMode), so callers MUST cancel the previous task before starting the
 * next one and ignore the resulting RenderingCancelledException.
 */
export async function startPageRender(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  return page.render({ canvasContext: context, viewport });
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
