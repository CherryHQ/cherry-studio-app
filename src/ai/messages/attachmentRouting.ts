/**
 * Chat-path attachment routing for mobile. In one pass over each message's
 * parts, every file part is inspected:
 *
 *   - **Native** (the provider/model accepts the media type natively)
 *     → inline as base64 data URL via `materializeNativeFilePart`.
 *   - **Non-native** (only PDF today)
 *     → extract text via the native `PdfTextExtractor` module and emit a
 *       `TextUIPart` so the model can read the content.
 *
 * Image/audio/video are always native on mobile — `stripUnsupportedMedia`
 * (messageCapabilities.ts) handles the model-capability gate later.
 *
 * Ported from desktop `src/main/ai/messages/attachmentRouting.ts`.
 */

import { requireOptionalNativeModule } from 'expo';

import type { FileUIPart, TextUIPart, UIMessage } from '@/data/types/message';

import { materializeNativeFilePart } from './fileProcessor';
import type { MediaCapabilities } from './messageCapabilities';

const PDF_MAX_PAGES = 50;
const PDF_TEXT_CAP = 8000;

function isNative(mediaType: string, caps: MediaCapabilities): boolean {
  if (mediaType.startsWith('image/')) return caps.image;
  if (mediaType.startsWith('audio/')) return caps.audio;
  if (mediaType.startsWith('video/')) return caps.video;
  if (mediaType === 'application/pdf') return caps.pdf;
  return false;
}

function noteOf(handle: string): TextUIPart {
  return { type: 'text', text: `Attached file "${handle}": [could not read this file].` };
}

function capExtractedText(text: string, filename: string): string {
  const head = text.length <= PDF_TEXT_CAP ? text : text.slice(0, PDF_TEXT_CAP);
  const truncated =
    text.length > PDF_TEXT_CAP ? `\n\n[Truncated ${head.length}/${text.length} chars.]` : '';
  return `Attached file "${filename}":\n${head}${truncated}`;
}

/**
 * Extract text from a PDF via the native `PdfTextExtractor` module.
 * Returns a `TextUIPart` on success, or a failure-note on error.
 */
async function extractNonNativePdf(url: string, filename: string): Promise<TextUIPart> {
  const PdfTextExtractor = requireOptionalNativeModule('PdfTextExtractor');
  if (!PdfTextExtractor) {
    return noteOf(filename);
  }

  try {
    const result = await PdfTextExtractor.extractText(url, { maxPages: PDF_MAX_PAGES });

    if (result.extractionError) {
      return noteOf(filename);
    }

    const text = result.text?.trim();
    if (!text) {
      return noteOf(filename);
    }

    return { type: 'text', text: capExtractedText(text, filename) };
  } catch {
    return noteOf(filename);
  }
}

// ── Message preparation ──────────────────────────────────────────────

/**
 * Prepare a single chat message: file parts are either inlined as base64
 * data URLs (native) or replaced with extracted text (non-native PDF).
 */
async function prepareChatMessage<T extends UIMessage>(
  message: T,
  nativeSupport: MediaCapabilities,
): Promise<T> {
  if (!message.parts?.length) return message;

  const kept: UIMessage['parts'] = [];
  for (const part of message.parts) {
    if (part.type !== 'file') {
      kept.push(part as UIMessage['parts'][number]);
      continue;
    }

    const fp = part as FileUIPart;
    const filename = fp.filename ?? 'file';
    const mediaType = fp.mediaType || 'application/octet-stream';

    if (isNative(mediaType, nativeSupport)) {
      // Native path — inline as base64 data URL
      const inlined = await materializeNativeFilePart(fp);
      if (!inlined) {
        kept.push(noteOf(filename) as UIMessage['parts'][number]);
        continue;
      }
      kept.push(inlined as UIMessage['parts'][number]);
    } else {
      // Non-native path — only PDF today; extract text
      const url = fp.url;
      if (!url) {
        kept.push(noteOf(filename) as UIMessage['parts'][number]);
        continue;
      }
      const textPart = await extractNonNativePdf(url, filename);
      kept.push(textPart as UIMessage['parts'][number]);
    }
  }

  return { ...message, parts: kept } as T;
}

/**
 * Prepare chat messages for the model: native files become base64 data URLs,
 * non-native PDFs become extracted text. Single pass, applied to every message.
 */
export async function prepareChatMessages<T extends UIMessage = UIMessage>(
  messages: T[],
  nativeSupport: MediaCapabilities,
): Promise<T[]> {
  return Promise.all(messages.map((message) => prepareChatMessage(message, nativeSupport)));
}
