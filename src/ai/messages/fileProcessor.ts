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
 * PDF files: when `extractPdf !== false`, text is extracted via the native
 * PdfTextExtractor module and returned as a `TextUIPart`. When `extractPdf
 * === false`, the PDF is treated like any other file (base64 data URL) so
 * models that natively accept PDF (Gemini, Claude, OpenAI) receive the real
 * bytes instead of extracted text.
 */
export async function resolveFileUIPart(
  part: FileUIPart,
  options?: { extractPdf?: boolean },
): Promise<FileUIPart | TextUIPart | null> {
  const url = part.url;
  if (!url) return part;
  if (!url.startsWith('file://')) return part;

  const filename = part.filename ?? 'file';
  const mediaType = part.mediaType || FALLBACK_MEDIA_TYPE;

  // PDF text extraction path — only when the model does NOT support native PDF.
  // Models that accept PDF natively get the raw bytes as base64 data URL below.
  if (mediaType === 'application/pdf' && options?.extractPdf !== false) {
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

  // Base64 inline path — all files (PDF included when extractPdf === false)
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
