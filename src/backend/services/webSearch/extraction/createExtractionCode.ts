import coreJs from './vendor/core-js-bundle.json';
import linkedom from './vendor/linkedom.json';
import readability from './vendor/mozilla-readability.json';
import gfm from './vendor/turndown-plugin-gfm.json';
import turndown from './vendor/turndown.json';

export const MAX_EXTRACTED_CONTENT_CHARACTERS = 24_000;

// Keep upstream assets unchanged. Only the worker's ESM export is replaced by
// a local return because the native entry executes a function, not an ES module.
const workerExportOffset = linkedom.code.lastIndexOf('\nexport {');
if (workerExportOffset < 0) throw new Error('The bundled DOM worker has no export boundary.');

function commonJs(code: string): string {
  return `(() => { const module = { exports: {} }; const exports = module.exports;\n${code}\nreturn module.exports; })()`;
}

const libraries = [
  coreJs.code,
  `const { DOMParser } = (() => {\n${linkedom.code.slice(0, workerExportOffset)}\nreturn { DOMParser }; })();`,
  'globalThis.window = { DOMParser };',
  `const Readability = ${commonJs(readability.code)};`,
  `const Turndown = ${commonJs(turndown.code)};`,
  gfm.code,
].join('\n');

/** HTML is a JSON value, never interpolated as executable page source. */
export function createExtractionCode(html: string, url: string): string {
  return `${libraries}\nconst input = ${JSON.stringify({ html, url })};
const document = new DOMParser().parseFromString(input.html, 'text/html');
let baseUrl = input.url;
const baseHref = document.querySelector('base[href]')?.getAttribute('href');
if (baseHref) {
  try { baseUrl = new URL(baseHref, input.url).href; } catch {}
}
Object.defineProperties(document, {
  URL: { value: input.url },
  documentURI: { value: input.url },
  baseURI: { value: baseUrl },
});
const article = new Readability(document, {
  maxElemsToParse: 20000,
  serializer: node => node,
}).parse();
if (!article || !article.textContent?.trim()) return { status: 'empty' };
const contentNode = article.content;
contentNode.querySelectorAll('script, style, iframe, object, embed, form').forEach(node => node.remove());
contentNode.querySelectorAll('*').forEach(node => {
  Array.from(node.attributes).forEach(attribute => {
    if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
  });
});
contentNode.querySelectorAll('a[href], img[src]').forEach(node => {
  const attribute = node.nodeName === 'A' ? 'href' : 'src';
  const value = node.getAttribute(attribute);
  if (value && !/^(https?:|#)/i.test(value)) node.removeAttribute(attribute);
});
// linkedom omits table collection properties used by the GFM converter.
contentNode.querySelectorAll('table').forEach(table => {
  const rows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table);
  Object.defineProperty(table, 'rows', { value: rows });
});
const converter = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
converter.use(turndownPluginGfm.gfm);
// Empty tables have no heading row for the plugin to inspect.
contentNode.querySelectorAll('table').forEach(table => { if (!table.rows.length) table.remove(); });
// Pass the existing tree, avoiding a second parse and preserving table collections.
// Turndown clones its input, so expose rows on the cloned table too.
const cloneNode = contentNode.cloneNode.bind(contentNode);
contentNode.cloneNode = deep => {
  const clone = cloneNode(deep);
  clone.querySelectorAll('table').forEach(table => {
    Object.defineProperty(table, 'rows', {
      value: Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table),
    });
  });
  return clone;
};
const content = converter.turndown(contentNode).trim();
if (!content) return { status: 'empty' };
return {
  status: 'ok',
  title: (article.title || '').trim().slice(0, 512),
  content: content.slice(0, ${MAX_EXTRACTED_CONTENT_CHARACTERS}),
  truncated: content.length > ${MAX_EXTRACTED_CONTENT_CHARACTERS},
};`;
}
