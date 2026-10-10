import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

import type { PdfResourceIndex } from './src/protocol';

const require = createRequire(import.meta.url);
const packageAssets = dirname(require.resolve('@cherrystudio/file-preview/assets/pdf.worker.js'));

/**
 * Escapes sequences that end or confuse an inline `<script>`/`<style>` element. `\x3C` is `<`
 * in strings, template literals and regular expressions alike, so the code keeps its meaning.
 */
function escapeInline(code: string): string {
  return code.replace(/<(\/(?:script|style)|!--)/gi, '\\x3C$1');
}

/** Inlines the single JS chunk and stylesheet into `file-preview.html`, which the app ships as one asset. */
function inlineDocument(): Plugin {
  return {
    name: 'file-preview-inline-document',
    apply: 'build',
    generateBundle: {
      // After Vite's own post-processing, which fills dynamic-import preload placeholders.
      order: 'post',
      handler(_options, bundle) {
        const page = bundle['index.html'];
        if (page?.type !== 'asset') throw new Error('index.html was not emitted');
        let html = String(page.source);
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type === 'chunk') {
            const tag = new RegExp(
              `<script type="module"[^>]*src="[^"]*${fileName}"[^>]*></script>`,
            );
            if (!tag.test(html))
              throw new Error(`Script ${fileName} is not referenced by the page`);
            const script = `<script type="module">${escapeInline(output.code)}</script>`;
            html = html.replace(tag, () => script);
            delete bundle[fileName];
          } else if (fileName.endsWith('.css')) {
            const tag = new RegExp(`<link rel="stylesheet"[^>]*href="[^"]*${fileName}"[^>]*>`);
            if (!tag.test(html))
              throw new Error(`Stylesheet ${fileName} is not referenced by the page`);
            const style = `<style>${escapeInline(String(output.source))}</style>`;
            html = html.replace(tag, () => style);
            delete bundle[fileName];
          }
        }
        // The package's own `new URL('assets/*.worker.js', import.meta.url)` fallback is never
        // taken because `createWorker` supplies both workers; drop the duplicate copies.
        for (const fileName of Object.keys(bundle)) {
          if (/^assets\/(pdf|xlsx)\.worker-[\w-]+\.js$/.test(fileName)) delete bundle[fileName];
        }
        const remaining = Object.keys(bundle).filter(
          (name) => name !== 'index.html' && !name.startsWith('pdf-resources.'),
        );
        if (remaining.length > 0)
          throw new Error(`Unexpected build outputs: ${remaining.join(', ')}`);
        delete bundle['index.html'];
        this.emitFile({ type: 'asset', fileName: 'file-preview.html', source: html });
      },
    },
  };
}

/** Concatenates pdf.js CMaps and standard fonts into one asset the app reads by byte range. */
function pdfResources(): Plugin {
  return {
    name: 'file-preview-pdf-resources',
    apply: 'build',
    generateBundle() {
      const index: PdfResourceIndex = {};
      const parts: Buffer[] = [];
      let offset = 0;
      const add = (key: string, file: string) => {
        const bytes = readFileSync(file);
        index[key] = [offset, bytes.length];
        parts.push(bytes);
        offset += bytes.length;
      };
      const cmaps = join(packageAssets, 'cmaps');
      for (const name of readdirSync(cmaps)
        .filter((file) => file.endsWith('.bcmap'))
        .sort()) {
        add(`cmap/${basename(name, '.bcmap')}`, join(cmaps, name));
      }
      const fonts = join(packageAssets, 'standard_fonts');
      for (const name of readdirSync(fonts)
        .filter((file) => !file.startsWith('LICENSE'))
        .sort()) {
        add(`standard_font/${name}`, join(fonts, name));
      }
      this.emitFile({ type: 'asset', fileName: 'pdf-resources.bin', source: Buffer.concat(parts) });
      this.emitFile({
        type: 'asset',
        fileName: 'pdf-resources.json',
        source: JSON.stringify(index),
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    // Everything inlines except the package's fallback worker URLs, removed in `inlineDocument`.
    assetsInlineLimit: (file) => !file.endsWith('.worker.js'),
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  esbuild: { jsx: 'automatic' },
  plugins: [inlineDocument(), pdfResources()],
});
