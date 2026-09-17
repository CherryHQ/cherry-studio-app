import {
  FilterMode,
  FontWeight,
  ImageFormat,
  MipmapMode,
  Skia,
  TextAlign,
  type SkParagraph,
} from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { ResolvedFile } from '@/shared/contracts/file';
import {
  getExportSignature,
  type ExportFile,
  type ExportSignature,
  type ExportWatermark,
} from '@/shared/contracts/fileExport';
import type { FileEntryProvenance } from '@/shared/data/types/file';
import { EXPORT_SIGNATURE_STYLE, exportSignatureColumns } from '@/shared/utils/exportSignature';

type PreparedImage = { uri: string; release(): void };

/** Finalized exports retain their chosen treatment; source images get a disposable copy. */
export async function prepareImageExport(
  source: { uri: string; provenance?: FileEntryProvenance },
  watermark: ExportWatermark,
): Promise<PreparedImage> {
  const signature = getExportSignature(watermark);
  if (source.provenance === 'document-export' || !signature)
    return { uri: source.uri, release() {} };

  const resources: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  let output: File | undefined;
  try {
    const data = keep(await Skia.Data.fromURI(source.uri));
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error('Cannot decode image for export');
    keep(image);
    const style = EXPORT_SIGNATURE_STYLE;
    const columns = exportSignatureColumns(style.referenceWidth);
    const brand = keep(createParagraph(signature.brandName, signature, true, columns.brandWidth));
    const timestamp = keep(
      createParagraph(signature.timestamp, signature, false, columns.rightWidth),
    );
    const footerHeight = Math.max(
      style.minHeight,
      Math.max(brand.getHeight(), timestamp.getHeight(), style.logoSize) + style.paddingY * 2,
    );
    const scale = image.width() / style.referenceWidth;
    const outputHeight = image.height() + Math.ceil(footerHeight * scale);
    // CPU rendering preserves the original pixel size without a GPU texture-size limit.
    const surface = Skia.Surface.Make(image.width(), outputHeight);
    if (!surface) throw new Error('Cannot allocate image export surface');
    keep(surface);
    const canvas = surface.getCanvas();
    canvas.drawImage(image, 0, 0);
    canvas.translate(0, image.height());
    canvas.scale(scale, scale);
    const paint = keep(Skia.Paint());
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(signature.background));
    canvas.drawRect(
      Skia.XYWHRect(0, 0, style.referenceWidth, (outputHeight - image.height()) / scale),
      paint,
    );

    brand.paint(canvas, columns.brandX, (footerHeight - brand.getHeight()) / 2);
    timestamp.paint(canvas, columns.rightX, (footerHeight - timestamp.getHeight()) / 2);

    const logoData = keep(Skia.Data.fromBase64(signature.logoDataUrl.split(',')[1]));
    const logo = Skia.Image.MakeImageFromEncoded(logoData);
    if (!logo) throw new Error('Cannot decode image export logo');
    keep(logo);
    const logoWidth = style.logoSize * (logo.width() / logo.height());
    canvas.drawImageRectOptions(
      logo,
      Skia.XYWHRect(0, 0, logo.width(), logo.height()),
      Skia.XYWHRect(
        style.paddingX + (style.logoSize - logoWidth) / 2,
        (footerHeight - style.logoSize) / 2,
        logoWidth,
        style.logoSize,
      ),
      FilterMode.Linear,
      MipmapMode.None,
      paint,
    );
    surface.flush();
    const snapshot = keep(surface.makeImageSnapshot());
    const bytes = snapshot.encodeToBytes(ImageFormat.PNG);
    const directory = new Directory(Paths.cache, 'ImageExports');
    directory.create({ idempotent: true, intermediates: true });
    output = new File(directory, `${randomUUID()}.png`);
    output.write(bytes);
    const completed = output;
    return {
      uri: completed.uri,
      release() {
        if (completed.exists) completed.delete();
      },
    };
  } catch (error) {
    if (output?.exists) output.delete();
    throw error;
  } finally {
    for (const resource of resources.toReversed()) resource.dispose();
  }
}

/** Shared by the share sheet and the system-opening escape hatch. */
export async function prepareFileExport(
  { entry, uri }: ResolvedFile,
  watermark: ExportWatermark,
): Promise<ExportFile & { release(): void }> {
  if (
    !entry.mediaType.trim().toLowerCase().startsWith('image/') ||
    entry.provenance === 'document-export' ||
    watermark.kind === 'none'
  ) {
    return { uri, filename: entry.filename, mediaType: entry.mediaType, release() {} };
  }
  const image = await prepareImageExport({ uri, provenance: entry.provenance }, watermark);
  const stem = entry.filename.replace(/\.[^.]+$/, '');
  return { ...image, filename: `${stem.slice(0, 251)}.png`, mediaType: 'image/png' };
}

function createParagraph(
  text: string,
  signature: ExportSignature,
  isPrimary: boolean,
  width: number,
): SkParagraph {
  const style = EXPORT_SIGNATURE_STYLE;
  const color = Skia.Color(signature.foreground);
  if (!isPrimary) color[3] *= style.secondaryOpacity;
  const fontSize = isPrimary ? style.primarySize : style.secondarySize;
  const lineHeight = isPrimary ? style.primaryLineHeight : style.secondaryLineHeight;
  const builder = Skia.ParagraphBuilder.Make({
    textAlign: isPrimary ? TextAlign.Left : TextAlign.Right,
    textStyle: {
      color,
      fontSize,
      fontStyle: { weight: isPrimary ? FontWeight.SemiBold : FontWeight.Normal },
      heightMultiplier: lineHeight / fontSize,
      halfLeading: true,
    },
  });
  try {
    const paragraph = builder.addText(text).build();
    paragraph.layout(width);
    return paragraph;
  } finally {
    // Skia's native ParagraphBuilder omits dispose even though its TS interface declares it.
    // The web implementation exposes it; native builders are released by the host object's GC.
    builder.dispose?.();
  }
}
