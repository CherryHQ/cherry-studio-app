import { getExportSignature, type ExportWatermark } from '@/shared/contracts/fileExport';

import { validateExportSignature } from './exportSignature';

export function renderMarkdownSignature(watermark?: ExportWatermark): string {
  const signature = getExportSignature(watermark);
  if (!signature) return '';
  validateExportSignature(signature);
  return `\n---\n\n**${escapeMarkdown(signature.brandName)}** · [${escapeMarkdown(signature.downloadLinkLabel)}](<${signature.downloadUrl}>)\n`;
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&').replace(/\r?\n/g, ' ');
}
