import { normalizeLatexDelimiters } from '@cherrystudio/ui/markdown';
import { renderToString } from 'katex';
import MarkdownIt from 'markdown-it';

import {
  DocumentExportError,
  type DocumentExportIssue,
  type ExportBlock,
  type ExportContentLabels,
  type ExportDocument,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';
import { getExportSignature } from '@/shared/contracts/fileExport';

import { DEFAULT_CONTENT_LABELS, exportFileType } from './contentPresentation';
import { escapeHtml, safeExportUrl } from './normalizeDocument';
import { renderHtmlStyles } from './renderHtmlStyles';
import { configureExportTables } from './renderTables';
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
  const renderer = createHtmlRenderer(document, inputPresentation, 'embedded');
  const prepared = await resolveDocumentAssets(renderer.sources, cache, readManagedImage, signal);
  const result = renderer.render(prepared.images, prepared.issues);
  signal.throwIfAborted();
  return result;
}

/** Render prepared Markdown without network reads or new files. Embedded PNG/JPEG stays visible. */
export function renderMarkdownPreview(
  source: string,
  presentation: ExportPresentation,
  labels?: ExportContentLabels,
): string {
  return createHtmlRenderer(
    { labels, sections: [{ id: 'preview', blocks: [{ kind: 'markdown', source }] }] },
    { ...presentation, imageFrame: undefined, watermark: { kind: 'none' } },
    'links',
  ).render(new Map(), []).html;
}

function createHtmlRenderer(
  document: ExportDocument,
  inputPresentation: ExportPresentation,
  imagePresentation: 'embedded' | 'links',
) {
  validatePresentation(inputPresentation);
  const presentation = {
    ...inputPresentation,
    imageFrame: inputPresentation.imageFrame ? { ...inputPresentation.imageFrame } : undefined,
    watermark:
      inputPresentation.watermark?.kind === 'cherry'
        ? { kind: 'cherry' as const, signature: { ...inputPresentation.watermark.signature } }
        : inputPresentation.watermark,
    colors: { ...inputPresentation.colors },
    typography: Object.fromEntries(
      Object.entries(inputPresentation.typography).map(([key, value]) => [key, { ...value }]),
    ) as ExportPresentation['typography'],
  };
  const labels = document.labels ?? DEFAULT_CONTENT_LABELS;
  const isImage = Boolean(presentation.imageFrame);
  const sources = new Map<string, NonNullable<ExportDocument['assets']>[string]>();
  const issues: DocumentExportIssue[] = [];
  const parser = new MarkdownIt({ html: false, breaks: true, linkify: false, maxNesting: 20 });
  parser.validateLink = (value) => Boolean(safeExportUrl(value)) || isEmbeddedImage(value);
  const renderCode = (source: string, info: string) => {
    const language = parser.utils.unescapeAll(info).trim().split(/\s+/)[0].toLowerCase();
    const label = /^[\w#+.-]{1,40}$/.test(language) ? language : labels.code;
    return `<div class="code-block"><div class="code-heading"><span>${escapeHtml(label)}</span></div><pre${isImage ? '' : ' tabindex="0"'}><code>${escapeHtml(source)}</code></pre></div>\n`;
  };
  parser.renderer.rules.fence = (tokens, index) =>
    renderCode(tokens[index].content, tokens[index].info);
  parser.renderer.rules.code_block = (tokens, index) => renderCode(tokens[index].content, '');
  parser.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const references = environment?.exportReferenceUrls;
    const href = tokens[index].attrGet('href');
    const label = tokens[index + 1];
    if (
      references instanceof Set &&
      typeof href === 'string' &&
      references.has(href) &&
      label?.type === 'text' &&
      /^\d+$/.test(label.content) &&
      tokens[index + 2]?.type === 'link_close'
    )
      tokens[index].attrSet('class', 'citation-link');
    return renderer.renderToken(tokens, index, options);
  };
  parser.inline.ruler.before('escape', 'export_math', (state, silent) => {
    const start = state.pos;
    const opening = ['$$', '$'].find((value) => state.src.startsWith(value, start));
    if (!opening) return false;
    const end = state.src.indexOf(opening, start + opening.length);
    if (end < 0 || end - start > 8192) return false;
    if (!silent) {
      const token = state.push('export_math', '', 0);
      token.content = state.src.slice(start + opening.length, end);
      token.block = opening === '$$';
    }
    state.pos = end + opening.length;
    return true;
  });
  parser.renderer.rules.export_math = (tokens, index) => {
    try {
      const formula = renderToString(tokens[index].content, {
        output: 'mathml',
        displayMode: tokens[index].block,
        trust: false,
        maxExpand: 100,
        maxSize: 20,
        throwOnError: true,
      });
      return `<span class="${tokens[index].block ? 'formula-block' : 'formula-inline'}" data-export-formula="${escapeHtml(tokens[index].content)}">${formula}</span>`;
    } catch {
      issues.push({ code: 'formula-fallback', label: 'Formula' });
      return `<code class="formula-fallback">${escapeHtml(tokens[index].content)}</code>`;
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
        for (const token of parser.parse(normalizeLatexDelimiters(block.source), {})) {
          for (const child of token.children ?? []) {
            const url = child.type === 'image' ? child.attrGet('src') : null;
            if (typeof url === 'string' && safeExportUrl(url))
              sources.set(url, { kind: 'remote-image', url });
          }
        }
      }
    }
  };
  if (imagePresentation === 'embedded')
    document.sections.forEach((section) => visitBlocks(section.blocks));
  return { sources, render };

  function render(
    images: ReadonlyMap<string, string>,
    assetIssues: readonly DocumentExportIssue[],
  ) {
    issues.push(...assetIssues);
    const resource = (name: string, kind: string, note: string, url?: string) =>
      `<span class="resource-card"><span class="resource-kind">${escapeHtml(kind)}</span><span class="resource-body"><span class="resource-heading">${link(name, url)}</span><span class="resource-note">${escapeHtml(note)}</span></span></span>`;
    const image = (key: string, alt: string) => {
      const data = isEmbeddedImage(key) ? key : images.get(key);
      if (data)
        return `<span class="export-image" data-export-unavailable="${escapeHtml(labels.imageUnavailable)}"><img src="${data}" alt="${escapeHtml(labels.image)}"></span>`;
      if (imagePresentation === 'links') {
        const url = safeExportUrl(key);
        return resource(
          alt || labels.image,
          labels.image,
          url ? new URL(url).hostname : labels.imageUnavailable,
          url,
        );
      }
      return `<span class="image-unavailable">${escapeHtml(labels.imageUnavailable)}</span>`;
    };
    parser.renderer.rules.image = (tokens, index) => {
      const source = tokens[index].attrGet('src');
      return image(typeof source === 'string' ? source : '', tokens[index].content);
    };
    // Install table presentation after discovering resources in the original token tree.
    configureExportTables(parser, isImage, labels.table);
    const renderBlocks = (
      blocks: readonly ExportBlock[],
      references: ReadonlySet<string>,
    ): string =>
      blocks
        .map((block) => {
          switch (block.kind) {
            case 'text':
              return `<div class="plain-text">${escapeHtml(block.text)}</div>`;
            case 'markdown':
              return `<div class="markdown">${parser.render(normalizeLatexDelimiters(block.source), { exportReferenceUrls: references })}</div>`;
            case 'image':
              return image(`asset:${block.assetId}`, block.alt);
            case 'attachment': {
              const url = block.url ? safeExportUrl(block.url) : undefined;
              return resource(
                block.name,
                exportFileType(block.name, block.mediaType) ?? labels.file,
                url ?? labels.fileMetadataOnly,
                url,
              );
            }
            case 'links':
              // Lucide Globe geometry, embedded for offline HTML and image capture.
              return `<aside class="references"><svg class="reference-icon" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg><span>${escapeHtml(block.summary ?? `${labels.sources} · ${block.items.length}`)}</span></aside>`;
            case 'details':
              return block.blocks.length
                ? `<details class="${block.presentation ?? 'reasoning'}"><summary>${escapeHtml(block.summary)}</summary><div class="details-content">${renderBlocks(block.blocks, references)}</div></details>`
                : `<div class="process-step">${escapeHtml(block.summary)}</div>`;
          }
        })
        .join('\n');
    const body = document.sections
      .map((section) => {
        const references = new Set(
          section.blocks.flatMap((block) =>
            block.kind === 'links'
              ? block.items.flatMap((item) => {
                  const url = safeExportUrl(item.url);
                  return url ? [url] : [];
                })
              : [],
          ),
        );
        const metadata = (section.metadata ?? [])
          .map(
            (item) => `<p class="muted">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</p>`,
          )
          .join('');
        if (section.presentation === 'bubble') {
          const attachments = section.blocks.filter(
            (block) => block.kind === 'image' || block.kind === 'attachment',
          );
          const content = section.blocks.filter(
            (block) => block.kind !== 'image' && block.kind !== 'attachment',
          );
          return `<section class="bubble-row" aria-label="${escapeHtml(section.heading ?? '')}"><div class="bubble-column">${attachments.length ? `<div class="attachments">${renderBlocks(attachments, references)}</div>` : ''}${content.length || metadata ? `<div class="bubble">${metadata}${renderBlocks(content, references)}</div>` : ''}</div></section>`;
        }
        const isMessage = section.presentation === 'message';
        return `<section class="${isMessage ? 'message-row' : 'document-section'}">${section.heading ? `<h2 class="${isMessage ? 'message-heading' : 'section-heading'}">${escapeHtml(section.heading)}</h2>` : ''}<div class="message-content">${metadata}${renderBlocks(section.blocks, references)}</div></section>`;
      })
      .join('\n');
    const signature = getExportSignature(presentation.watermark);
    const isConversation = document.sections.some((section) => section.presentation);
    const title =
      document.title && !isConversation
        ? `<h1 class="document-title">${escapeHtml(document.title)}</h1>`
        : '';
    const content = `<article class="document-content${isConversation ? ' conversation' : ''}"${presentation.imageFrame ? ` aria-label="${escapeHtml(presentation.imageFrame.label)}"` : ''}>${title}${body}</article>`;
    const footer = signature
      ? `<footer class="print-signature"><div class="print-identity"><img class="print-logo" src="${signature.logoDataUrl}" alt=""><strong class="print-brand">${escapeHtml(signature.brandName)}</strong></div><time class="print-timestamp print-secondary">${escapeHtml(signature.timestamp)}</time></footer>`
      : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title ?? '')}</title><style>${renderHtmlStyles(presentation)}</style></head><body><main class="${isImage ? 'image-print' : 'html-document'}">${content}${footer}</main></body></html>`;
    return { html, issues };
  }
}

function isEmbeddedImage(value: string) {
  return /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function validatePresentation(value: ExportPresentation) {
  const frame = value.imageFrame;
  const signature = getExportSignature(value.watermark);
  const colors = Object.values(value.colors);
  if (frame) colors.push(frame.background);
  if (signature) colors.push(signature.background, signature.foreground);
  if (
    !Number.isFinite(value.width) ||
    value.width < 280 ||
    value.width > 800 ||
    ['base', 'sm', 'lg', 'xl'].some((key) => {
      const size = value.typography[key as keyof ExportPresentation['typography']];
      return (
        !size ||
        !Number.isFinite(size.fontSize) ||
        size.fontSize < 12 ||
        size.fontSize > 40 ||
        !Number.isFinite(size.lineHeight) ||
        size.lineHeight < size.fontSize ||
        size.lineHeight > 56
      );
    }) ||
    colors.some((color) => !/^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color)) ||
    (frame && (typeof frame.label !== 'string' || frame.label.length > 256)) ||
    (signature &&
      ([signature.brandName, signature.timestamp].some(
        (text) => typeof text !== 'string' || text.length > 256,
      ) ||
        typeof signature.logoDataUrl !== 'string' ||
        signature.logoDataUrl.length > 32_768 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(signature.logoDataUrl)))
  )
    throw new DocumentExportError('invalid-input');
}

function link(label: string, url?: string) {
  const safe = url ? safeExportUrl(url) : undefined;
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(label)}</a>` : escapeHtml(label);
}
