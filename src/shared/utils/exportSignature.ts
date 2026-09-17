/** Shared geometry for the HTML footer and native image export compositor. */
export const EXPORT_SIGNATURE_STYLE = {
  referenceWidth: 360,
  paddingX: 16,
  paddingY: 8,
  columnGap: 12,
  detailGap: 8,
  logoSize: 24,
  primarySize: 14,
  primaryLineHeight: 20,
  secondarySize: 12,
  secondaryLineHeight: 18,
  secondaryOpacity: 0.56,
  minHeight: 56,
} as const;

export function exportSignatureColumns(width: number) {
  const style = EXPORT_SIGNATURE_STYLE;
  const available = width - style.paddingX * 2 - style.columnGap;
  const leftWidth = available / 2;
  const rightWidth = available - leftWidth;
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

export function formatExportTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
