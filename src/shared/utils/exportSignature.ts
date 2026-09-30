import { DocumentExportError } from '@/shared/contracts/documentExport';
import type { ExportSignature } from '@/shared/contracts/fileExport';

/** Shared geometry for the HTML footer and native image export compositor. */
export const EXPORT_SIGNATURE_STYLE = {
  referenceWidth: 360,
  paddingX: 24,
  paddingY: 8,
  columnGap: 12,
  detailGap: 8,
  ruleHeight: 2,
  logoSize: 28,
  primarySize: 14,
  primaryLineHeight: 20,
  secondarySize: 12,
  secondaryLineHeight: 18,
  secondaryOpacity: 0.56,
  qrCodeSize: 48,
} as const;

export function exportSignatureColumns(width: number) {
  const style = EXPORT_SIGNATURE_STYLE;
  const textX = style.paddingX + style.logoSize + style.detailGap;
  const qrCodeX = width - style.paddingX - style.qrCodeSize;
  return { textX, textWidth: qrCodeX - style.columnGap - textX, qrCodeX };
}

export function validateExportSignature(signature: ExportSignature): void {
  const isEmbeddedPng = (value: string) =>
    typeof value === 'string' &&
    value.length <= 32_768 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  if (
    [signature.brandName, signature.downloadLabel, signature.downloadLinkLabel].some(
      (text) => typeof text !== 'string' || !text || text.length > 256,
    ) ||
    [signature.background, signature.foreground, signature.brandColor].some(
      (color) => typeof color !== 'string' || !/^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color),
    ) ||
    !isEmbeddedPng(signature.logoDataUrl) ||
    !isEmbeddedPng(signature.qrCodeDataUrl) ||
    !isHttpsUrl(signature.downloadUrl)
  )
    throw new DocumentExportError('invalid-input');
}

function isHttpsUrl(value: string) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s<>]/.test(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
