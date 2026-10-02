import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

/** Files from public/ the editor needs offline (og-image, robots and sitemap are only for crawlers). */
const PUBLIC_OFFLINE = [
  'manifest.webmanifest',
  'favicon.svg',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

/**
 * Built files that only the PDF tools use. They are left out of the precache so a visit to
 * the image editor doesn't download ~1 MB of PDF code; the PDF page asks the service worker
 * to keep them (see the 'cache-pdf' message in public/sw.js).
 */
const PDF_ONLY = /^(assets\/pdf\/|pdfjs\/|pdf\/)/;

/**
 * Writes the list of built files and a build id into dist/sw.js, so the service worker
 * precaches exactly this build and drops the previous one when a new version ships.
 */
function serviceWorkerManifest(): Plugin {
  return {
    name: 'atelie:sw-manifest',
    apply: 'build',
    enforce: 'post',
    // writeBundle sees the final bundle (pure-CSS entry chunks already removed)
    writeBundle(options, bundle) {
      const hash = createHash('sha256');
      const files: string[] = [];
      const pdfFiles: string[] = [];
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (name.endsWith('.map')) continue;
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        // every browser that runs the editor reads woff2; plain woff stays a runtime fallback
        if (name.endsWith('.woff') || name === 'index.html') continue;
        if (!PDF_ONLY.test(name)) files.push(name);
        // pdf.js's decoders and fonts are fetched (and then kept) only by PDFs that need them
        else if (!name.startsWith('pdfjs/')) pdfFiles.push(name === 'pdf/index.html' ? 'pdf/' : name);
      }
      const buildId = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const rel = (f: string) => (f.startsWith('./') ? f : `./${f}`);
      const list = ['./', ...files, ...PUBLIC_OFFLINE].map(rel);
      const swPath = resolve(options.dir ?? resolve(root, 'dist'), 'sw.js');
      const source = readFileSync(swPath, 'utf8');
      const out = source
        .replace("const BUILD_ID = 'dev';", `const BUILD_ID = '${buildId}';`)
        .replace("/* precache */ ['./']", JSON.stringify(list))
        .replace('/* pdf-files */ []', JSON.stringify(pdfFiles.map(rel)));
      if (out === source || out.includes('/* precache */') || out.includes('/* pdf-files */')) {
        throw new Error('sw.js placeholders not found; the service worker would not precache the build');
      }
      writeFileSync(swPath, out);
    },
  };
}

/** pdf.js data it fetches on demand: decoders for scanned images and the 14 standard fonts. */
const PDFJS_DATA: Record<string, string> = {
  wasm: resolve(root, 'node_modules/pdfjs-dist/wasm'),
  standard_fonts: resolve(root, 'node_modules/pdfjs-dist/standard_fonts'),
};
// the JavaScript engine for PDF forms with scripts is not used
const PDFJS_SKIP = /^quickjs/;

/** Serves pdf.js's data files at /pdfjs/ in development and copies them to dist/pdfjs/. */
function pdfjsData(): Plugin {
  return {
    name: 'atelie:pdfjs-data',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const [dir, file] = decodeURIComponent((req.url ?? '').split('?')[0])
          .replace(/^\//, '')
          .split('/');
        const base = PDFJS_DATA[dir];
        const path = base && file ? join(base, file) : '';
        if (!path || !path.startsWith(base) || !existsSync(path) || !statSync(path).isFile()) return next();
        if (path.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() {
      for (const [dir, base] of Object.entries(PDFJS_DATA)) {
        for (const file of readdirSync(base)) {
          if (PDFJS_SKIP.test(file)) continue;
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${file}`,
            source: readFileSync(join(base, file)),
          });
        }
      }
    },
  };
}

const isPdfModule = (id: string) => /node_modules\/(pdfjs-dist|@cantoo|fflate)\/|\/src\/pdf\//.test(id);
const isSharedModule = (id: string) =>
  /\/src\/(editor|ui|workers)\/|\/src\/(main|pwa)\.ts|@fontsource/.test(id);
/** A chunk with PDF code and nothing the editor also loads. */
const isPdfChunk = (ids: readonly string[]) => ids.some(isPdfModule) && !ids.some(isSharedModule);

// base './' keeps every asset path relative, so the same build works on
// GitHub Pages (/atelie-de-colagem/) and later on the custom domain (/).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [pdfjsData(), serviceWorkerManifest()],
  build: {
    target: 'es2022',
    // pdf.js (~1.3 MB worker) only loads on /pdf/ when a PDF is opened
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        privacidade: resolve(root, 'privacidade.html'),
        termos: resolve(root, 'termos.html'),
        pdf: resolve(root, 'pdf/index.html'),
      },
      output: {
        // PDF-only code goes to assets/pdf/ so the service worker can tell it apart
        entryFileNames: (chunk) =>
          chunk.name === 'pdf' ? 'assets/pdf/[name]-[hash].js' : 'assets/[name]-[hash].js',
        chunkFileNames: (chunk) =>
          isPdfChunk(chunk.moduleIds) ? 'assets/pdf/[name]-[hash].js' : 'assets/[name]-[hash].js',
        assetFileNames: (asset) =>
          asset.names.some((n) => /^pdf[.-]/.test(n)) ||
          asset.originalFileNames.some((n) => isPdfModule(`/${n}`))
            ? 'assets/pdf/[name]-[hash][extname]'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
