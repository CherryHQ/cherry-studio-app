import { DocumentExportError } from '@/shared/contracts/documentExport';
import type { ExportSignature } from '@/shared/contracts/fileExport';

/** Shared geometry for the HTML footer and native image export compositor. */
export const EXPORT_SIGNATURE_STYLE = {
  referenceWidth: 360,
  paddingX: 24,
  paddingY: 16,
  columnGap: 16,
  detailGap: 8,
  textGap: 6,
  ruleHeight: 2,
  logoSize: 20,
  brandSize: 14,
  brandLineHeight: 20,
  primarySize: 16,
  primaryLineHeight: 24,
  secondarySize: 12,
  secondaryLineHeight: 18,
  secondaryOpacity: 0.56,
  qrCodeSize: 84,
  qrCodePadding: 8,
  placeholderBorderWidth: 1,
  minHeight: 120,
} as const;

export function exportSignatureColumns(width: number) {
  const style = EXPORT_SIGNATURE_STYLE;
  const available = width - style.paddingX * 2 - style.columnGap;
  const rightWidth = style.qrCodeSize;
  const leftWidth = available - rightWidth;
  const rightX = style.paddingX + leftWidth + style.columnGap;
  const brandX = style.paddingX + style.logoSize + style.detailGap;
  return {
    leftWidth,
    rightWidth,
    rightX,
    brandX,
    brandWidth: leftWidth - style.logoSize - style.detailGap,
  };
}

export function validateExportSignature(signature: ExportSignature): void {
  const isEmbeddedPng = (value: string) =>
    typeof value === 'string' &&
    value.length <= 32_768 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  if (
    [signature.brandName, signature.tagline, signature.downloadLabel, signature.qrCodeLabel].some(
      (text) => typeof text !== 'string' || !text || text.length > 256,
    ) ||
    [signature.background, signature.foreground, signature.brandColor].some(
      (color) => typeof color !== 'string' || !/^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(color),
    ) ||
    !isEmbeddedPng(signature.logoDataUrl) ||
    (signature.qrCodeDataUrl !== '' && !isEmbeddedPng(signature.qrCodeDataUrl)) ||
    typeof signature.downloadUrl !== 'string' ||
    signature.downloadUrl.length > 2048
  )
    throw new DocumentExportError('invalid-input');

  if (signature.downloadUrl) {
    try {
      const url = new URL(signature.downloadUrl);
      if (url.protocol !== 'https:' || /[\s<>]/.test(signature.downloadUrl))
        throw new Error('Invalid download URL');
    } catch {
      throw new DocumentExportError('invalid-input');
    }
  } else if (signature.qrCodeDataUrl) {
    throw new DocumentExportError('invalid-input');
  }
}
