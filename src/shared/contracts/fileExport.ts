export type ExportWatermarkStyle = ExportWatermark['kind'];
export const DEFAULT_EXPORT_WATERMARK_STYLE: ExportWatermarkStyle = 'cherry';
export type FileExportOptions = { watermark?: ExportWatermarkStyle };

export type ExportSignature = {
  background: string;
  foreground: string;
  brandColor: string;
  logoDataUrl: string;
  brandName: string;
  /** Accompanies the QR code in images and HTML. */
  downloadLabel: string;
  /** Markdown has no QR code, so its link omits the scan instruction. */
  downloadLinkLabel: string;
  downloadUrl: string;
  qrCodeDataUrl: string;
};

/** Resolved once per export, so previews and delivered bytes use the same treatment. */
export type ExportWatermark = { kind: 'none' } | { kind: 'cherry'; signature: ExportSignature };

export function getExportSignature(watermark?: ExportWatermark): ExportSignature | undefined {
  switch (watermark?.kind) {
    case undefined:
    case 'none':
      return undefined;
    case 'cherry':
      return watermark.signature;
    default:
      throw new Error('Unsupported export watermark');
  }
}

export type ExportFile = {
  uri: string;
  filename: string;
  mediaType: string;
};
