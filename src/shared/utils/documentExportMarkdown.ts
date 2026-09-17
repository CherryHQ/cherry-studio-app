import { DocumentExportError } from '@/shared/contracts/documentExport';
import { getExportSignature, type ExportWatermark } from '@/shared/contracts/fileExport';

export function renderMarkdownSignature(watermark?: ExportWatermark): string {
  const signature = getExportSignature(watermark);
  if (!signature) return '';
  if (
    [signature.brandName, signature.timestamp].some(
      (text) => typeof text !== 'string' || text.length > 256,
    )
  )
    throw new DocumentExportError('invalid-input');
  return `\n---\n\n**${escapeMarkdown(signature.brandName)}** · ${escapeMarkdown(signature.timestamp)}\n`;
}

export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&').replace(/\r?\n/g, ' ');
}
