import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
      for (const [name, item] of Object.entries(bundle).sort(([a], [b]) => a.localeCompare(b))) {
        if (name.endsWith('.map')) continue;
        hash.update(name).update(item.type === 'chunk' ? item.code : item.source);
        // every browser that runs the editor reads woff2; plain woff stays a runtime fallback
        if (!name.endsWith('.woff') && name !== 'index.html') files.push(name);
      }
      const buildId = `${pkg.version}-${hash.digest('hex').slice(0, 10)}`;
      const list = ['./', ...files, ...PUBLIC_OFFLINE].map((f) => (f.startsWith('./') ? f : `./${f}`));
      const swPath = resolve(options.dir ?? resolve(root, 'dist'), 'sw.js');
      const source = readFileSync(swPath, 'utf8');
      const out = source
        .replace("const BUILD_ID = 'dev';", `const BUILD_ID = '${buildId}';`)
        .replace("/* precache */ ['./']", JSON.stringify(list));
      if (out === source || out.includes('/* precache */')) {
        throw new Error('sw.js placeholders not found; the service worker would not precache the build');
      }
      writeFileSync(swPath, out);
    },
  };
}

// base './' keeps every asset path relative, so the same build works on
// GitHub Pages (/atelie-de-colagem/) and later on the custom domain (/).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorkerManifest()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        privacidade: resolve(root, 'privacidade.html'),
        termos: resolve(root, 'termos.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
