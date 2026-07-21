/**
 * tools/build-npm-cjs.mjs
 *
 * Deterministically build a CommonJS (CJS) `miniprogram_npm` tree for the
 * WeChat Mini Program DevTools simulator runtime -- without depending on the
 * DevTools GUI / `build-npm` tool.
 *
 * ## Why this exists
 * `tdesign-miniprogram@1.15.3`'s `miniprogram_dist` is shipped as **ESM**
 * (`import` / `export`). The WeChat simulator runtime (WASubContext,
 * lib 3.17.0) evaluates `miniprogram_npm` modules as **CommonJS**, so the raw
 * ESM copy produced by the DevTools `build-npm` tool throws
 * `SyntaxError: Unexpected token 'export'` and the page fails to register
 * (`Page "pages/login/login" has not been registered yet`).
 *
 * We fix it by transpiling every `.js` under `tdesign-miniprogram` from ESM to
 * CJS with the esbuild JS API (transform only -- no bundling, so relative and
 * bare `require(...)` specifiers are preserved verbatim for the WeChat runtime
 * to resolve).
 *
 * ## Steps
 *   a. Delete the existing `miniprogram_npm`.
 *   b. Recursively copy `node_modules/tdesign-miniprogram/miniprogram_dist`
 *      -> `miniprogram_npm/tdesign-miniprogram` (preserving the full tree:
 *      .js / .json / .wxss / images / ...).
 *   c. Copy `node_modules/tslib` -> `miniprogram_npm/tslib` (tslib is already
 *      CJS via `tslib.js`; ensure a CJS `index.js` root entry also exists).
 *   d. Transpile every `.js` under `miniprogram_npm/tdesign-miniprogram` with
 *      esbuild (`loader:'js'`, `format:'cjs'`, `platform:'node'`,
 *      `target:'es2017'`) and write the result back.
 *
 * No `.wechatide.ib.json` index files are emitted -- DevTools rebuilds its own
 * file index when the project is opened.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SRC_TDESIGN = path.join(
  root,
  'node_modules',
  'tdesign-miniprogram',
  'miniprogram_dist',
);
const SRC_TSLIB = path.join(root, 'node_modules', 'tslib');
const OUT_DIR = path.join(root, 'miniprogram_npm');
const OUT_TDESIGN = path.join(OUT_DIR, 'tdesign-miniprogram');
const OUT_TSLIB = path.join(OUT_DIR, 'tslib');

/**
 * Recursively copy a directory tree, preserving structure and every file type
 * (`.js`, `.json`, `.wxss`, images, fonts, ...). Symbolic links are
 * dereferenced so the copy is self-contained and portable for the mini program
 * runtime.
 * @param {string} src source directory
 * @param {string} dest destination directory
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        copyDir(realPath, destPath);
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Recursively collect every `.js` file path under a directory.
 * @param {string} dir root directory
 * @returns {string[]} absolute paths of `.js` files
 */
function collectJsFiles(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

/**
 * Count all files under a directory (for logging only).
 * @param {string} dir root directory
 * @returns {number} file count
 */
function countFiles(dir) {
  let n = 0;
  if (!fs.existsSync(dir)) return n;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFiles(full);
    else n += 1;
  }
  return n;
}

async function main() {
  // (a) Wipe any previous build so we never mix ESM + CJS artifacts.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  console.log(`[build-npm-cjs] wiped ${path.relative(root, OUT_DIR)}`);

  // Sanity checks: source trees must be present (run \`npm install\` first).
  if (!fs.existsSync(SRC_TDESIGN)) {
    console.error(`[build-npm-cjs] FATAL: missing ${SRC_TDESIGN}`);
    process.exit(1);
  }
  if (!fs.existsSync(SRC_TSLIB)) {
    console.error(`[build-npm-cjs] FATAL: missing ${SRC_TSLIB} (run npm install)`);
    process.exit(1);
  }

  // (b) Copy tdesign-miniprogram/miniprogram_dist verbatim.
  copyDir(SRC_TDESIGN, OUT_TDESIGN);
  console.log(
    `[build-npm-cjs] copied tdesign-miniprogram (${countFiles(OUT_TDESIGN)} files)`,
  );

  // (c) Copy tslib verbatim (it is already CJS via tslib.js).
  copyDir(SRC_TSLIB, OUT_TSLIB);
  // Guarantee a CJS root entry `index.js` exists. WeChat resolves
  // `require('tslib')` through tslib's package.json `main` (tslib.js), but we
  // also expose a self-contained CJS `index.js` so the runtime has a stable
  // entry point and the build can be self-verified.
  const tslibMain = path.join(OUT_TSLIB, 'tslib.js');
  const tslibIndex = path.join(OUT_TSLIB, 'index.js');
  if (!fs.existsSync(tslibIndex)) {
    if (fs.existsSync(tslibMain)) {
      fs.copyFileSync(tslibMain, tslibIndex);
    } else {
      fs.writeFileSync(tslibIndex, "module.exports = require('./tslib.js');\n", 'utf8');
    }
  }
  console.log(
    `[build-npm-cjs] copied tslib (entry: ${fs.existsSync(tslibIndex) ? 'index.js' : 'tslib.js'})`,
  );

  // (d) Transpile every .js under miniprogram_npm/tdesign-miniprogram ESM->CJS.
  const jsFiles = collectJsFiles(OUT_TDESIGN);
  let transpiled = 0;
  let errors = 0;
  for (const file of jsFiles) {
    const code = fs.readFileSync(file, 'utf8');
    try {
      const result = await esbuild.transform(code, {
        loader: 'js',
        format: 'cjs',
        platform: 'node',
        target: 'es2017',
        sourcefile: path.relative(root, file),
      });
      fs.writeFileSync(file, result.code, 'utf8');
      transpiled += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `[build-npm-cjs] transform failed: ${path.relative(root, file)}\n  ${err.message}`,
      );
    }
  }
  console.log(
    `[build-npm-cjs] transpiled ${transpiled}/${jsFiles.length} .js files to CJS (errors: ${errors})`,
  );

  if (errors > 0) {
    process.exit(1);
  }
  console.log('[build-npm-cjs] done.');
}

main().catch((err) => {
  console.error('[build-npm-cjs] unexpected error:', err);
  process.exit(1);
});
