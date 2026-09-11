import type { ExportBlock, ExportDocument } from '@/shared/contracts/documentExport';

import { escapeHtml, escapeMarkdown, safeExportUrl } from './normalizeDocument';

export function renderMarkdown(document: ExportDocument): string {
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
            const url = source?.kind === 'remote-image' ? safeExportUrl(source.url) : undefined;
            return url
              ? `![${escapeMarkdown(block.alt)}](<${url}>)`
              : `[${escapeMarkdown(block.alt || 'Image')}]`;
          }
          case 'attachment':
            return `${link(block.name, block.url)}${block.mediaType ? ` (${escapeMarkdown(block.mediaType)})` : ''}`;
          case 'links':
            return block.items.map((item) => `- ${link(item.label, item.url)}`).join('\n');
          case 'details':
            return block.blocks.length
              ? `<details>\n<summary>${escapeHtml(block.summary)}</summary>\n\n${renderBlocks(block.blocks)}\n\n</details>`
              : escapeMarkdown(block.summary);
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
