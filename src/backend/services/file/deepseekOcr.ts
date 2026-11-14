import { File } from 'expo-file-system';
import * as z from 'zod';

import {
  DeepseekServiceError,
  resolveDeepseekConnection,
} from '@/backend/services/providers/deepseekConnection';
import { deepseekUpload, requestDeepseekJson } from '@/backend/services/providers/deepseekHttp';
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { ExtractResult } from '../../../../modules/pdf-text-extractor';
import { hashLocalFile } from './fileHash';
import { fileTextCacheFile, readFileTextCache, writeFileTextCache } from './fileTextCache';
import { takeCodePoints } from './utf8Text';

const ocrSchema = z.object({
  page_count: z.number().int().min(1).max(1000),
  pages: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      text: z.string(),
      finish_reason: z.enum(['stop', 'length']),
    }),
  ),
});

/** Cloud results never share a cache identity with native OCR or another credential scope. */
export async function readDeepseekOcr(uri: string, signal: AbortSignal): Promise<ExtractResult> {
  const source = new File(uri);
  if (!source.exists) throw new DeepseekServiceError('failed');
  if (source.size > 100 * 1024 * 1024) throw new DeepseekServiceError('limit');
  const connection = await resolveDeepseekConnection(signal);
  const hash = await hashLocalFile(uri, signal);
  const identity = sha256HexOfText(`${connection.scope}\n${hash}\ntext_recognition`);
  const cache = fileTextCacheFile(source, `deepseek-${identity}`);
  const cached = await readFileTextCache(cache, 1000);
  signal.throwIfAborted();
  if (cached && source.exists && (await hashLocalFile(uri, signal)) === hash) return cached;
  const recognized = await requestDeepseekJson(
    connection,
    '/v1/tools/ocr',
    deepseekUpload(source, 'text_recognition'),
    ocrSchema,
    signal,
  );
  if (
    recognized.page_count !== recognized.pages.length ||
    recognized.pages.some((page, index) => page.index !== index)
  )
    throw new DeepseekServiceError('invalid-response');
  const text = recognized.pages
    .map((page) =>
      page.text
        .replace(/<｜box｜>[\s\S]*?<｜\/box｜>/g, '')
        .replace(/<｜\/?ref｜>/g, '')
        .trim(),
    )
    .join('\n\n');
  const bounded = takeCodePoints(text, 1_000_000);
  const result: ExtractResult = {
    text: bounded.value,
    totalPages: recognized.page_count,
    extractedPages: recognized.page_count,
    isTruncated:
      bounded.didTruncate || recognized.pages.some((page) => page.finish_reason === 'length'),
    extractionError: false,
    ocrError: false,
    ocrUnavailable: false,
    unrecognizedPages: [],
  };
  if (!source.exists || (await hashLocalFile(uri, signal)) !== hash)
    throw new DeepseekServiceError('failed');
  signal.throwIfAborted();
  writeFileTextCache(cache, result, 1000);
  return result;
}
