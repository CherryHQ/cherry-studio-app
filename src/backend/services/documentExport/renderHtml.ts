import { renderToString } from 'katex';
import MarkdownIt from 'markdown-it';

import {
  DocumentExportError,
  type DocumentExportIssue,
  type ExportBlock,
  type ExportDocument,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';

import { escapeHtml, safeExportUrl } from './normalizeDocument';
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
  validatePresentation(inputPresentation);
  const presentation = {
    ...inputPresentation,
    imageFrame: inputPresentation.imageFrame ? { ...inputPresentation.imageFrame } : undefined,
    colors: { ...inputPresentation.colors },
    typography: Object.fromEntries(
      Object.entries(inputPresentation.typography).map(([key, value]) => [key, { ...value }]),
    ) as ExportPresentation['typography'],
  };
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
            if (typeof url === 'string' && safeExportUrl(url))
              sources.set(url, { kind: 'remote-image', url });
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
      : `<p class="image-placeholder">[${escapeHtml(alt || 'Image')}]</p>`;
  };
  parser.renderer.rules.image = (tokens, index) => {
    const source = tokens[index].attrGet('src');
    return image(typeof source === 'string' ? source : '', tokens[index].content);
  };
  const renderBlocks = (blocks: readonly ExportBlock[]): string =>
    blocks
      .map((block) => {
        switch (block.kind) {
          case 'text':
            return `<div class="plain-text">${escapeHtml(block.text)}</div>`;
          case 'markdown':
            return `<div class="markdown">${parser.render(block.source)}</div>`;
          case 'image':
            return image(`asset:${block.assetId}`, block.alt);
          case 'attachment':
            return `<div class="attachment">${link(block.name, block.url)}${block.mediaType ? ` <span class="muted">${escapeHtml(block.mediaType)}</span>` : ''}</div>`;
          case 'links':
            return `<ul class="references">${block.items.map((item) => `<li>${link(item.label, item.url)}${safeExportUrl(item.url) ? `<span class="reference-url">${escapeHtml(item.url)}</span>` : ''}</li>`).join('')}</ul>`;
          case 'details':
            return block.blocks.length
              ? `<details class="${block.presentation ?? 'reasoning'}"><summary>${escapeHtml(block.summary)}</summary><div class="details-content">${renderBlocks(block.blocks)}</div></details>`
              : `<div class="process-step">${escapeHtml(block.summary)}</div>`;
        }
      })
      .join('\n');
  const body = document.sections
    .map((section, index) => {
      const metadata = (section.metadata ?? [])
        .map((item) => `<p class="muted">${escapeHtml(item.label)}: ${escapeHtml(item.value)}</p>`)
        .join('');
      if (presentation.imageFrame) {
        const heading = section.heading ? escapeHtml(section.heading) : '';
        return `<section class="print-section"><header class="print-heading"><span class="print-index">${String(index + 1).padStart(2, '0')}</span>${heading}</header><div class="message-content">${metadata}${renderBlocks(section.blocks)}</div></section>`;
      }
      if (section.presentation === 'bubble') {
        const attachments = section.blocks.filter(
          (block) => block.kind === 'image' || block.kind === 'attachment',
        );
        const content = section.blocks.filter(
          (block) => block.kind !== 'image' && block.kind !== 'attachment',
        );
        return `<section class="bubble-row" aria-label="${escapeHtml(section.heading ?? '')}"><div class="bubble-column">${attachments.length ? `<div class="attachments">${renderBlocks(attachments)}</div>` : ''}${content.length || metadata ? `<div class="bubble">${metadata}${renderBlocks(content)}</div>` : ''}</div></section>`;
      }
      const heading = section.heading
        ? section.presentation === 'message'
          ? `<header class="message-heading">${escapeHtml(section.heading)}</header>`
          : `<h2>${escapeHtml(section.heading)}</h2>`
        : '';
      return `<section class="${section.presentation === 'message' ? 'message-row' : 'document-section'}">${heading}<div class="message-content">${metadata}${renderBlocks(section.blocks)}</div></section>`;
    })
    .join('\n');
  const isConversation = document.sections.some((section) => section.presentation);
  const { colors, typography, width, imageFrame } = presentation;
  const { base, sm, lg, xl } = typography;
  const title = document.title && !isConversation ? `<h1>${escapeHtml(document.title)}</h1>` : '';
  const content = imageFrame
    ? `<article class="print-content"><header class="print-caption"><span>${escapeHtml(imageFrame.label)}</span><span class="print-index">01—${String(document.sections.length).padStart(2, '0')}</span></header>${title}${body}</article><footer class="print-signature"><strong class="print-brand">${escapeHtml(imageFrame.brandName)}</strong><div class="print-metadata"><img class="print-logo" src="${imageFrame.logoDataUrl}" alt=""><span class="print-divider" aria-hidden="true"></span><time class="print-timestamp">${escapeHtml(imageFrame.timestamp)}</time></div></footer>`
    : `${title}${body}`;
  // Match the native message rows and CherryUI Markdown rhythm. The page supplies the
  // same resolved color tokens and accessibility type scale used by those components.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(document.title ?? '')}</title><style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${colors.background};color:${colors.foreground}}
body{font:${base.fontSize}px/${base.lineHeight + 2}px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;overflow-wrap:anywhere;-webkit-text-size-adjust:100%}
main{width:100%;max-width:${width}px;margin:0 auto;padding:12px 16px 24px}
h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,table,hr{margin:0 0 12px}
h1,h2,h3,h4,h5,h6,strong,b,th{font-weight:600}
h1{font-size:${xl.fontSize}px;line-height:${xl.lineHeight}px;margin-bottom:10px}
h2{font-size:${lg.fontSize}px;line-height:${lg.lineHeight}px;margin-bottom:8px}
h3,h4,h5{font-size:${base.fontSize}px;line-height:${base.lineHeight}px;margin-bottom:8px}
h4,h5,h6{margin-bottom:6px}h6{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
.muted,.image-placeholder{color:${colors.muted};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
a{color:${colors.link};text-decoration:none;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible{outline:2px solid ${colors.link};outline-offset:3px}
.document-section+.document-section{padding-top:24px}
.bubble-row{display:flex;justify-content:flex-end;padding:8px 0}
.bubble-column{width:88%;display:flex;align-items:flex-end;flex-direction:column;gap:8px;min-width:0}
.bubble{max-width:100%;min-width:0;padding:10px 16px;border-radius:18px;background:${colors.bubble};line-height:${base.lineHeight}px}
.plain-text{white-space:pre-wrap}.bubble>.plain-text+.plain-text{margin-top:8px}
.attachments{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:100%;min-width:0}
.attachment{max-width:100%;border:1px solid ${colors.border};border-radius:12px;padding:10px 12px;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
.attachment .muted{display:block}
.message-row{padding:12px 0;display:flex;flex-direction:column;gap:10px}
.message-heading{font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;font-weight:600}
.message-content{display:flex;flex-direction:column;gap:16px;min-width:0}
.message-content>*,.markdown>:last-child,.details-content>:last-child,.bubble>:last-child{margin-bottom:0}
img{display:block;max-width:100%;height:auto;border-radius:12px;margin:0 0 12px}
.attachments>img{max-height:320px;max-width:100%;object-fit:contain;margin:0}
pre,code{font-family:"GeistMono-Regular","SFMono-Regular",Consolas,monospace;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
code{background:${colors.inlineCode};color:${colors.inlineCodeForeground};border-radius:4px;padding:2px 4px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;border-radius:12px;background:${colors.codeBlock}}
pre code{color:${colors.foreground};background:transparent;border:0;padding:0}
table{width:100%;table-layout:fixed;border-spacing:0;border:1px solid ${colors.border};border-radius:12px;overflow:hidden;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
td,th{padding:9px 12px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:${colors.secondary}}tr+tr>*{border-top:1px solid ${colors.border}}thead+tbody tr:first-child>*{border-top:1px solid ${colors.border}}td+td,th+th{border-left:1px solid ${colors.border}}
blockquote{padding:2px 0 2px 12px;border-left:3px solid ${colors.border};color:${colors.muted}}blockquote>:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid ${colors.border}}
ul,ol{padding-left:32px}li+li{margin-top:6px}li>p{margin-bottom:6px}li>ul,li>ol{margin-top:6px;margin-bottom:0}
details{min-width:0}summary{display:flex;align-items:center;gap:4px;min-height:40px;padding:4px 8px;margin:0 -8px;list-style:none;cursor:pointer;color:${colors.tertiary};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;font-weight:400;border-radius:8px}
summary::-webkit-details-marker{display:none}summary::after{content:"";width:6px;height:6px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg);flex-shrink:0;margin-left:4px}
details[open]>summary::after{transform:rotate(135deg)}
.process{border-bottom:1px solid ${colors.subtleBorder}}
.process[open]{padding-bottom:16px}
.details-content{display:flex;flex-direction:column;gap:4px}
details:not([open])>.details-content{display:none}
.process>.details-content{margin-top:12px}
.reasoning>.details-content{margin-top:6px;border-left:2px solid ${colors.border};padding-left:12px}
.process .details-content summary{min-height:32px;padding-top:2px;padding-bottom:2px}
.process-step{min-height:32px;color:${colors.tertiary};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;padding:2px 0;display:flex;align-items:center}
.references{list-style:none;padding:0;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}.reference-url{display:block;color:${colors.muted};overflow-wrap:anywhere}
math{max-width:100%;overflow-wrap:anywhere}math[display="block"]{padding:12px;margin:0 0 12px;text-align:center}
${
  imageFrame
    ? `main.image-print{padding:16px 16px 0;background:${imageFrame.background}}
.print-content{padding:24px 20px;background:${colors.background};color:${colors.foreground}}
.print-caption{display:flex;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid ${colors.border};margin-bottom:24px;color:${colors.muted};font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px}
.print-caption+.print-section{padding-top:0}.print-caption+h1{margin-bottom:24px}
.print-section{padding-top:24px}.print-section+.print-section{margin-top:24px;border-top:1px solid ${colors.subtleBorder}}
.print-heading{display:flex;align-items:baseline;gap:12px;margin-bottom:16px;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;color:${colors.muted}}
.print-index{font-family:"SFMono-Regular",Consolas,monospace;font-size:${Math.max(12, sm.fontSize - 1)}px;white-space:nowrap}
.print-content img,.print-content pre,.print-content table,.print-content .attachment{border-radius:0}
.print-signature{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;min-height:44px;padding:8px 0;color:${imageFrame.foreground}}
.print-brand{min-width:0;font-size:${sm.fontSize}px;line-height:${sm.lineHeight}px;letter-spacing:.02em;text-transform:uppercase}
.print-metadata{display:flex;align-items:center;gap:8px;margin-left:auto;max-width:100%}
img.print-logo{width:20px;height:20px;flex-shrink:0;object-fit:contain;border-radius:0;margin:0}
.print-divider{width:1px;height:16px;flex-shrink:0;background:currentColor;opacity:.2}
.print-timestamp{font-family:"SFMono-Regular",Consolas,monospace;font-size:${Math.max(12, sm.fontSize - 1)}px;line-height:${sm.lineHeight - 2}px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}`
    : ''
}
</style></head><body><main${imageFrame ? ' class="image-print"' : ''}>${content}</main></body></html>`;
  signal.throwIfAborted();
  return { html, issues };
}

function validatePresentation(value: ExportPresentation) {
  const frame = value.imageFrame;
  const colors = frame
    ? [...Object.values(value.colors), frame.background, frame.foreground]
    : Object.values(value.colors);
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
    (frame &&
      ([frame.brandName, frame.label, frame.timestamp].some(
        (text) => typeof text !== 'string' || text.length > 256,
      ) ||
        typeof frame.logoDataUrl !== 'string' ||
        frame.logoDataUrl.length > 32_768 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(frame.logoDataUrl)))
  )
    throw new DocumentExportError('invalid-input');
}

function link(label: string, url?: string) {
  const safe = url ? safeExportUrl(url) : undefined;
  return safe ? `<a href="${escapeHtml(safe)}">${escapeHtml(label)}</a>` : escapeHtml(label);
}
