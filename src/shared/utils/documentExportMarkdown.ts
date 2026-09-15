import { DocumentExportError, type ExportSignature } from '@/shared/contracts/documentExport';

export function renderMarkdownSignature(
  signature?: Pick<ExportSignature, 'brandName' | 'timestamp'>,
): string {
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
