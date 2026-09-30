import { getExportSignature, type ExportWatermark } from '@/shared/contracts/fileExport';

import { validateExportSignature } from './exportSignature';

export function renderMarkdownSignature(watermark?: ExportWatermark): string {
  const signature = getExportSignature(watermark);
  if (!signature) return '';
  validateExportSignature(signature);
  const download = signature.downloadUrl
    ? `[${escapeMarkdown(signature.downloadLabel)}](<${signature.downloadUrl}>)`
    : escapeMarkdown(signature.downloadLabel);
  return `\n---\n\n**${escapeMarkdown(signature.brandName)}**\n\n${escapeMarkdown(signature.tagline)}\n\n${download}\n`;
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&').replace(/\r?\n/g, ' ');
}
