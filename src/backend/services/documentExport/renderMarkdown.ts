import type { ExportBlock, ExportDocument } from '@/shared/contracts/documentExport';
import { escapeMarkdown } from '@/shared/utils/documentExportMarkdown';

import { DEFAULT_CONTENT_LABELS, exportFileType } from './contentPresentation';
import { safeExportUrl } from './normalizeDocument';
import {
  resolveDocumentAssets,
  type PreparedAsset,
  type ReadManagedImage,
} from './resolveDocumentAssets';

/** Local and generated pictures travel in the Markdown file; remote Markdown links stay authored. */
export async function renderMarkdownWithImages(
  document: ExportDocument,
  cache: Map<string, PreparedAsset>,
  readManagedImage: ReadManagedImage,
  signal: AbortSignal,
) {
  const sources = new Map<string, NonNullable<ExportDocument['assets']>[string]>();
  const visit = (blocks: readonly ExportBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'image') {
        const source = document.assets?.[block.assetId];
        if (source?.kind === 'managed-file') sources.set(`asset:${block.assetId}`, source);
      } else if (block.kind === 'details') visit(block.blocks);
    }
  };
  document.sections.forEach((section) => visit(section.blocks));
  const prepared = await resolveDocumentAssets(sources, cache, readManagedImage, signal);
  signal.throwIfAborted();
  return { text: renderMarkdown(document, prepared.images), issues: prepared.issues };
}

export function renderMarkdown(
  document: ExportDocument,
  images?: ReadonlyMap<string, string>,
): string {
  const labels = document.labels ?? DEFAULT_CONTENT_LABELS;
  const renderBlocks = (blocks: readonly ExportBlock[]): string =>
    blocks
      .map((block) => {
        switch (block.kind) {
          case 'text':
            return block.text.split(/\r?\n/).map(escapeMarkdown).join('  \n');
          case 'markdown':
            return block.source;
          case 'image': {
            const source = document.assets?.[block.assetId];
            const url =
              images?.get(`asset:${block.assetId}`) ??
              (source?.kind === 'remote-image' ? safeExportUrl(source.url) : undefined);
            return url
              ? `![${escapeMarkdown(block.alt)}](<${url}>)`
              : `> **${escapeMarkdown(labels.image)}** · ${escapeMarkdown(block.alt || labels.image)}\n>\n> ${escapeMarkdown(images ? labels.imageUnavailable : labels.fileMetadataOnly)}`;
          }
          case 'attachment': {
            const type = exportFileType(block.name, block.mediaType);
            const hasLink = block.url && safeExportUrl(block.url);
            return `> **${link(block.name, block.url)}**${type ? ` · ${type}` : ''}${hasLink ? '' : `\n>\n> ${escapeMarkdown(labels.fileMetadataOnly)}`}`;
          }
          case 'links':
            return `**${escapeMarkdown(labels.sources)}**\n\n${block.items.map((item) => `- ${link(item.label, item.url)}`).join('\n')}`;
          case 'details':
            // Portable readers need no HTML/disclosure support to retain included content.
            return [
              `**${escapeMarkdown(block.summary)}**`,
              ...(block.blocks.length ? [renderBlocks(block.blocks)] : []),
            ]
              .join('\n\n')
              .split('\n')
              .map((line) => `> ${line}`)
              .join('\n');
        }
      })
      .join('\n\n');
  return (
    [
      document.title ? `# ${escapeMarkdown(document.title)}` : '',
      ...document.sections.map((section) =>
        [
          section.heading ? `## ${escapeMarkdown(section.heading)}` : '',
          ...(section.metadata ?? []).map(
            (item) => `${escapeMarkdown(item.label)}: ${escapeMarkdown(item.value)}`,
          ),
          renderBlocks(section.blocks),
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
    ]
      .filter(Boolean)
      .join('\n\n---\n\n') + '\n'
  );
}

function link(label: string, url?: string): string {
  const safe = url ? safeExportUrl(url) : undefined;
  return safe ? `[${escapeMarkdown(label)}](<${safe}>)` : escapeMarkdown(label);
}
