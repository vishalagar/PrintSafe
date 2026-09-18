#!/usr/bin/env node
/**
 * Copies the pdf.js runtime files that are fetched lazily, at render time,
 * into public/ so Next.js serves them as static files.
 *
 * pdf.js does not bundle these into pdf.mjs or the worker:
 *   - build/pdf.worker.min.mjs  the parsing/rendering worker
 *   - wasm/                     OpenJPEG (JPEG 2000 "JPXDecode" images, which
 *                               scanners and iLovePDF-style tools produce) and
 *                               qcms (ICC colour profiles)
 *   - standard_fonts/           the 14 standard fonts when a PDF does not
 *                               embed them
 *   - cmaps/                    CJK character maps
 *
 * A worker/API version mismatch throws loudly. A missing or stale wasm
 * decoder does NOT: pdf.js logs a worker-side warning, skips the image, and
 * reports the render as successful — a scanned page comes out blank. Running
 * this on postinstall and before every build keeps the copies in step with the
 * installed pdfjs-dist version.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(ROOT, "node_modules", "pdfjs-dist");
const PUBLIC_ROOT = path.join(ROOT, "public");

/** Paths relative to node_modules/pdfjs-dist and to public/ respectively. */
const COPIES = Object.freeze([
  { from: "build/pdf.worker.min.mjs", to: "pdf.worker.min.mjs" },
  { from: "wasm", to: "pdfjs/wasm" },
  { from: "standard_fonts", to: "pdfjs/standard_fonts" },
  { from: "cmaps", to: "pdfjs/cmaps" },
]);

function readInstalledVersion() {
  const packageJson = path.join(SOURCE_ROOT, "package.json");
  if (!existsSync(packageJson)) {
    throw new Error(`pdfjs-dist is not installed (no ${packageJson}).`);
  }
  return JSON.parse(readFileSync(packageJson, "utf8")).version;
}

function copyOne({ from, to }) {
  const source = path.join(SOURCE_ROOT, from);
  const destination = path.join(PUBLIC_ROOT, to);
  if (!existsSync(source)) {
    throw new Error(
      `pdfjs-dist asset missing: ${source}. Has the package layout changed?`,
    );
  }
  mkdirSync(path.dirname(destination), { recursive: true });
  // Replace directories wholesale so files from an older pdf.js cannot linger.
  if (statSync(source).isDirectory()) {
    rmSync(destination, { recursive: true, force: true });
  }
  cpSync(source, destination, { recursive: true });
  return `${from} -> public/${to}`;
}

function main() {
  const version = readInstalledVersion();
  const done = COPIES.map(copyOne);
  console.log(`pdfjs-dist ${version} assets copied:\n  ${done.join("\n  ")}`);
}

try {
  main();
} catch (error) {
  console.error(`copy-pdfjs-assets failed: ${error.message}`);
  process.exit(1);
}
