import { defineConfig, type Plugin } from 'vite';
import { createReadStream, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = '/leonida-online-map/';
const DATA = resolve(import.meta.dirname, 'data');
const FONTS = resolve(import.meta.dirname, 'fonts');

/**
 * data/*.geojson is the source of truth and is edited by hand, so it is not duplicated into public/.
 * Dev: served straight from data/. Build: copied to dist/data/. Font licences go to dist/licenses/.
 */
function leonidaData(): Plugin {
  return {
    name: 'leonida-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/leonida-online-map\/data\/([\w.-]+\.geojson)(?:\?.*)?$/);
        if (!m) return next();
        const file = resolve(DATA, m[1]);
        if (!existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', 'application/geo+json');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const f of readdirSync(DATA).filter((n) => n.endsWith('.geojson'))) {
        this.emitFile({ type: 'asset', fileName: `data/${f}`, source: readFileSync(resolve(DATA, f)) });
      }
      for (const f of readdirSync(FONTS).filter((n) => n.startsWith('OFL-') && n.endsWith('.txt'))) {
        this.emitFile({ type: 'asset', fileName: `licenses/${f}`, source: readFileSync(resolve(FONTS, f)) });
      }
    },
  };
}

/** Fontsource ships woff2 and woff; every browser that runs WebGL2 reads woff2, so drop the woff fallbacks. */
const woff2Only = {
  postcssPlugin: 'woff2-only',
  Declaration: {
    src(decl: { value: string }) {
      decl.value = decl.value.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
    },
  },
};

export default defineConfig({
  base: BASE,
  plugins: [leonidaData()],
  css: { postcss: { plugins: [woff2Only] } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    assetsInlineLimit: 0,
  },
});
