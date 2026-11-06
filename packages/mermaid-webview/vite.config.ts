import { defineConfig, type Plugin } from 'vite';

/**
 * Escapes sequences that end or confuse an inline `<script>`. `\x3C` is `<` in strings,
 * template literals and regular expressions alike, so the code keeps its meaning.
 */
function escapeInline(code: string): string {
  return code.replace(/<(\/(?:script|style)|!--)/gi, '\\x3C$1');
}

/** Inlines the single JS chunk into `mermaid.html`, which the app ships as one asset. */
function inlineDocument(): Plugin {
  return {
    name: 'mermaid-inline-document',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const page = bundle['index.html'];
        if (page?.type !== 'asset') throw new Error('index.html was not emitted');
        let html = String(page.source);
        for (const [fileName, output] of Object.entries(bundle)) {
          if (output.type !== 'chunk') continue;
          const tag = new RegExp(`<script type="module"[^>]*src="[^"]*${fileName}"[^>]*></script>`);
          if (!tag.test(html)) throw new Error(`Script ${fileName} is not referenced by the page`);
          const script = `<script type="module">${escapeInline(output.code)}</script>`;
          html = html.replace(tag, () => script);
          delete bundle[fileName];
        }
        const remaining = Object.keys(bundle).filter((name) => name !== 'index.html');
        if (remaining.length > 0)
          throw new Error(`Unexpected build outputs: ${remaining.join(', ')}`);
        delete bundle['index.html'];
        this.emitFile({ type: 'asset', fileName: 'mermaid.html', source: html });
      },
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [inlineDocument()],
});
