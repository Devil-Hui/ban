/**
 * patch-tdesign-icon-font.mjs
 *
 * Fixes the WeChat DevTools "do-not-use-local-path" (HTTP 500) failure that
 * blanks out every TDesign icon font glyph.
 *
 * Root cause: DevTools hard-blocks any *local* font file path referenced from a
 * wxss `@font-face src:url(...)` — whether absolute (`/assets/...`) or relative
 * (`../../assets/...`). It mangles the path into `-do-not-use-local-path-...`
 * and returns 500, so the icon font never loads.
 *
 * Correct fix: inline the woff font as a base64 `data:` URI directly in the
 * `src`. Data URIs are officially supported by WeChat and keep the font bytes
 * in the local package (no CDN link), satisfying the "download locally, no
 * remote link" requirement while avoiding the local-path interception.
 *
 * Idempotent: if a target file already contains an inlined base64 font it is
 * skipped. Re-running is safe.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// --- font source -----------------------------------------------------------
const fontRel = 'assets/fonts/t.woff';
const fontPath = path.join(root, fontRel);
const DATA_URI_PREFIX = 'data:font/woff;base64,';

// --- targets ---------------------------------------------------------------
// TDesign's own component definition of `font-family:t` (used by <t-icon>),
// plus the global app-level override that guarantees the local font wins.
const targets = [
  path.join(root, 'miniprogram_npm/tdesign-miniprogram/icon/icon.wxss'),
  path.join(root, 'styles/tdesign-icon-font-local.wxss'),
  // Keep the npm source tree consistent for rebuilds (may not exist -> not-found).
  path.join(root, 'node_modules/tdesign-miniprogram/miniprogram_dist/icon/icon.wxss'),
];

// --- helpers ---------------------------------------------------------------
/**
 * Build the canonical `@font-face` block for the TDesign icon font with the
 * woff bytes inlined as a base64 data URI.
 * @param {string} dataUri fully-formed `data:font/woff;base64,...` string
 * @returns {string}
 */
function buildFace(dataUri) {
  return `@font-face{font-family:t;src:url('${dataUri}') format('woff');font-weight:400;font-style:normal;}`;
}

/**
 * Replace any `@font-face{...}` block that declares `font-family:t` with the
 * inlined data-URI block. Works for both the minified one-line form used by
 * TDesign and the expanded multi-line form used by our local override.
 * @param {string} text file contents
 * @param {string} dataUri inlined font data URI
 * @returns {{ next: string, changed: boolean }}
 */
function patchFace(text, dataUri) {
  const faceRe = /@font-face\s*\{[^}]*\}/g;
  const isIconFace = /font-family\s*:\s*t\b/;
  const canonical = buildFace(dataUri);
  let changed = false;
  const next = text.replace(faceRe, (block) => {
    if (!isIconFace.test(block)) return block;
    changed = true;
    return canonical;
  });
  return { next, changed };
}

// --- main ------------------------------------------------------------------
function main() {
  if (!fs.existsSync(fontPath)) {
    console.error(`[patch:icon-font] FATAL: font source missing: ${fontPath}`);
    process.exit(1);
  }
  const b64 = fs.readFileSync(fontPath).toString('base64');
  const dataUri = DATA_URI_PREFIX + b64;
  console.log(
    `[patch:icon-font] font ${fontRel} -> base64 ${b64.length} chars ` +
      `(decoded ${(b64.length * 3) / 4 | 0} bytes)`,
  );

  for (const file of targets) {
    if (!fs.existsSync(file)) {
      console.log(`not-found: ${path.relative(root, file)}`);
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes(DATA_URI_PREFIX)) {
      console.log(`skipped (already inlined): ${path.relative(root, file)}`);
      continue;
    }
    const { next, changed } = patchFace(text, dataUri);
    if (!changed) {
      console.log(`skipped (no @font-face{font-family:t} match): ${path.relative(root, file)}`);
      continue;
    }
    fs.writeFileSync(file, next, 'utf8');
    console.log(`patched: ${path.relative(root, file)}`);
  }
}

main();
