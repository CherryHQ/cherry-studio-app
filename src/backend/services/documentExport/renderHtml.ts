import { renderToString } from 'katex';
import MarkdownIt from 'markdown-it';

import {
  DocumentExportError,
  type DocumentExportIssue,
  type ExportBlock,
  type ExportDocument,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';

import { safeExportUrl } from './normalizeDocument';
import {
  resolveDocumentAssets,
  type PreparedAsset,
  type ReadManagedImage,
} from './resolveDocumentAssets';

export async function renderHtml(
  document: ExportDocument,
  inputPresentation: ExportPresentation,
  cache: Map<string, PreparedAsset>,
  readManagedImage: ReadManagedImage,
  signal: AbortSignal,
) {
  const presentation = { ...inputPresentation, colors: { ...inputPresentation.colors } };
  validatePresentation(presentation);
  const sources = new Map<string, NonNullable<ExportDocument['assets']>[string]>();
  const issues: DocumentExportIssue[] = [];
  const parser = new MarkdownIt({ html: false, breaks: true, linkify: false, maxNesting: 20 });
  parser.validateLink = (value) => Boolean(safeExportUrl(value));
  parser.inline.ruler.before('escape', 'export_math', (state, silent) => {
    const start = state.pos;
    const opening = ['$$', '\\[', '\\(', '$'].find((value) => state.src.startsWith(value, start));
    if (!opening) return false;
    const closing = opening === '\\[' ? '\\]' : opening === '\\(' ? '\\)' : opening;
    const end = state.src.indexOf(closing, start + opening.length);
    if (end < 0 || end - start > 8192) return false;
    if (!silent) {
      const token = state.push('export_math', '', 0);
      token.content = state.src.slice(start + opening.length, end);
      token.block = opening === '$$' || opening === '\\[';
    }
    state.pos = end + closing.length;
    return true;
  });
  parser.renderer.rules.export_math = (tokens, index) => {
    try {
      return renderToString(tokens[index].content, {
        output: 'mathml',
        displayMode: tokens[index].block,
        trust: false,
        maxExpand: 100,
        maxSize: 20,
        throwOnError: true,
      });
    } catch {
      issues.push({ code: 'formula-fallback', label: 'Formula' });
      return `<code>${escapeHtml(tokens[index].content)}</code>`;
    }
  };
  // Discover images through parsed tokens, so code examples never trigger network reads.
  const visitBlocks = (blocks: readonly ExportBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'image') {
        const source = document.assets?.[block.assetId];
        if (source) sources.set(`asset:${block.assetId}`, source);
      } else if (block.kind === 'details') visitBlocks(block.blocks);
      else if (block.kind === 'markdown') {
        for (const token of parser.parse(block.source, {})) {
          for (const child of token.children ?? []) {
            const url = child.type === 'image' ? child.attrGet('src') : null;
            if (url && safeExportUrl(url)) sources.set(url, { kind: 'remote-image', url });
          }
        }
      }
    }
  };
  document.sections.forEach((section) => visitBlocks(section.blocks));
  if (sources.size > 32) throw new DocumentExportError('size-limit');
  const prepared = await resolveDocumentAssets(sources, cache, readManagedImage, signal);
  issues.push(...prepared.issues);
  let embeddedCharacters = 0;
  const image = (key: string, alt: string) => {
    const data = prepared.images.get(key);
    if (data) {
      embeddedCharacters += data.length;
      if (embeddedCharacters > 24 * 1024 * 1024) throw new DocumentExportError('size-limit');
    }
    return data
      ? `<img src="${data}" alt="${escapeHtml(alt)}">`
      : `<p class="muted">[${escapeHtml(alt || 'Image')}]</p>`;
  };
  parser.renderer.rules.image = (tokens, index) =>
    image(tokens[index].attrGet('src') ?? '', tokens[index].content);
  const renderBlocks = (blocks: readonly ExportBlock[]): string =>
    blocks
      .map((block) => {
        switch (block.kind) {
          case 'markdown':
            return parser.render(block.source);
          case 'image':
            return image(`asset:${block.assetId}`, block.alt);
          case 'attachment':
            return `<p>${link(block.name, block.url)}${block.mediaType ? ` <span class="muted">(${escapeHtml(block.mediaType)})</span>` : ''}</p>`;
          case 'links':
            return `<ul>${block.items.map((item) => `<li>${link(item.label, item.url)}${safeExportUrl(item.url) ? `<br><span class="muted">${escapeHtml(item.url)}</span>` : ''}</li>`).join('')}</ul>`;
          case 'details':
            return `<details open><summary>${escapeHtml(block.summary)}</summary>${renderBlocks(block.blocks)}</details>`;
        }
      })
      .join('\n');
  const body = document.sections
    .map(
      (section) =>
        `<section>${section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : ''}${(section.metadata ?? []).map((item) => `<p class="muted">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</p>`).join('')}${renderBlocks(section.blocks)}</section>`,
    )
    .join('\n');
  const { colors, fontSize, width } = presentation;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title ?? '')}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:${colors.background};color:${colors.foreground}}body{font:${fontSize}px/1.65 -apple-system,BlinkMacSystemFont,Arial,sans-serif;overflow-wrap:anywhere}main{width:100%;padding:24px}h1{font-size:1.5em}h2{font-size:1.2em}h1,h2,h3{line-height:1.35}section+section{border-top:1px solid ${colors.border};margin-top:24px;padding-top:16px}p{margin:12px 0}.muted{color:${colors.muted}}a{color:${colors.link};overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:12px 0}pre,code{font-family:ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border:1px solid ${colors.border}}table{width:100%;table-layout:fixed;border-collapse:collapse}td,th{border:1px solid ${colors.border};padding:6px;overflow-wrap:anywhere}blockquote{margin:12px 0;padding-left:12px;border-left:3px solid ${colors.border}}details{margin:12px 0}summary{font-weight:600}math{max-width:100%;overflow-wrap:anywhere}ul,ol{padding-left:24px}
</style></head><body><main>${document.title ? `<h1>${escapeHtml(document.title)}</h1>` : ''}${body}</main></body></html>`;
  signal.throwIfAborted();
  return { html, issues };
}

function validatePresentation(value: ExportPresentation) {
  if (
    !Number.isFinite(value.width) ||
    value.width < 280 ||
    value.width > 800 ||
    !Number.isFinite(value.fontSize) ||
    value.fontSize < 12 ||
    value.fontSize > 24 ||
    Object.values(value.colors).some(
      (color) => !/^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color),
    )
  )
    throw new DocumentExportError('invalid-input');
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function link(label: string, url?: string) {
  const safe = url ? safeExportUrl(url) : undefined;
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(label)}</a>` : escapeHtml(label);
}
