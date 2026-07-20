/**
 * Mobile file resolver for AI message parts.
 *
 * Cherry's v2 messages may store `FileUIPart.url` as `file://...`.
 * AI SDK's `convertToModelMessages` won't fetch `file://` URLs. Desktop
 * rewrites those with Node fs; mobile uses Expo FileSystem to produce data URLs.
 *
 * PDF files are special: instead of sending raw base64 (unreadable to most
 * models), text is extracted via the native PdfTextExtractor module and inlined
 * as a text part — following the desktop `attachmentRouting.ts` non-native path.
 */

import * as FileSystem from 'expo-file-system';
import { requireNativeModule } from 'expo';

import type { FileUIPart, TextUIPart } from '@/data/types/message';

const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

const PDF_MAX_PAGES = 50;
const PDF_TEXT_CAP = 8000;

function capExtractedText(text: string, filename: string): string {
  const head = text.length <= PDF_TEXT_CAP ? text : text.slice(0, PDF_TEXT_CAP);
  const truncated =
    text.length > PDF_TEXT_CAP ? `\n\n[Truncated ${head.length}/${text.length} chars.]` : '';
  return `Attached file "${filename}":\n${head}${truncated}`;
}

/**
 * Rewrite any `file://` URLs in a `FileUIPart` to base64 data URLs. Leaves
 * `data:` / `https:` / `http:` URLs untouched. If the file can't be read,
 * returns `null` to signal the caller should drop the part.
 *
 * PDF files with `application/pdf` mediaType are handled differently: text is
 * extracted via the native module and returned as a `TextUIPart`.
 */
export async function resolveFileUIPart(part: FileUIPart): Promise<FileUIPart | TextUIPart | null> {
  const url = part.url;
  if (!url) return part;
  if (!url.startsWith('file://')) return part;

  const filename = part.filename ?? 'file';
  const mediaType = part.mediaType || FALLBACK_MEDIA_TYPE;

  if (mediaType === 'application/pdf') {
    try {
      const filePath = url.slice(7);
      if (!filePath) {
        return { type: 'text', text: `Attached file "${filename}": [could not read this file].` };
      }

      const PdfTextExtractor = requireNativeModule('PdfTextExtractor');
      const result = await PdfTextExtractor.extractText(filePath, { maxPages: PDF_MAX_PAGES });

      const text = result.text?.trim();
      if (!text) {
        return { type: 'text', text: `Attached file "${filename}": [could not read this file].` };
      }

      return { type: 'text', text: capExtractedText(text, filename) };
    } catch {
      return { type: 'text', text: `Attached file "${filename}": [could not read this file].` };
    }
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(url, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return {
      ...part,
      mediaType,
      url: `data:${mediaType};base64,${base64}`,
    };
  } catch {
    return null;
  }
}
