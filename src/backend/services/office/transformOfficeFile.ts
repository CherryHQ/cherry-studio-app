import type * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';

import type { OfficeImageInput } from './createOfficeCode';
import {
  OfficeGenerationError,
  officeLimits,
  OFFICE_MAX_MEMORY_BYTES,
  writtenSize,
} from './generateOfficeFile';
import type { OfficeTransformRequest } from './officeEditSpec';
import { officeRuntimeCode } from './officePackageCode';
import type { OfficeImage } from './officeSpec';
import { officeTransformCode } from './officeTransformCode';

/** Input file 0 is the source package; replacement images follow in `images` order. */
export function createOfficeTransformCode(
  request: OfficeTransformRequest,
  images: Readonly<Record<string, OfficeImageInput>> = {},
): string {
  return `
${officeRuntimeCode}
const request = ${JSON.stringify(request)};
const images = ${JSON.stringify(images)};
try {
  ${
    request.operation === 'inspect' && request.kind === 'check'
      ? `const check = checkOfficePackage(readInput(0), request.format, request.against ? readInput(1) : undefined);
  const { findings, ...summary } = check;
  return { kind: 'check', ...summary, total: findings.length, offset: request.offset,
    findings: findings.slice(request.offset, request.offset + request.limit) };`
      : `return (() => { ${officeTransformCode} })();`
  }
}
catch (error) { return { error: String(error.message || error).slice(0, 500) }; }
`;
}

/** Reads `source`; an edit writes the new package to `output` and returns its size. */
export async function transformOfficeFile(input: {
  source: { uri: string; size: number };
  against?: { uri: string; size: number };
  request: OfficeTransformRequest;
  images?: Readonly<Record<string, OfficeImage>>;
  output?: string;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<{ size: number } | { content: Record<string, z.core.util.JSONType> }> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    const entries = Object.entries(input.images ?? {});
    const code = createOfficeTransformCode(
      input.request,
      Object.fromEntries(
        entries.map(([id, image], index) => [id, { index: index + 1, mediaType: image.mediaType }]),
      ),
    );
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      files: {
        inputs: [
          input.source.uri,
          ...(input.against ? [input.against.uri] : []),
          ...entries.map(([, image]) => image.uri),
        ],
        output: input.output,
      },
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        ...officeLimits(0, 128 * 1024),
        // Only app code runs here, and a parsed XML part takes about 180 times its text (a 2 MiB
        // sheet: 352 MiB), which the compressed input size does not predict.
        memoryBytes: OFFICE_MAX_MEMORY_BYTES,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error')
      throw new OfficeGenerationError(
        outcome.kind === 'memory'
          ? 'The file is too large or complex to process on this device.'
          : `Office operation failed (${outcome.kind}).`,
      );
    if (!outcome.result || outcome.resultTruncated)
      throw new OfficeGenerationError(
        'Office result exceeds its limit. Read a smaller range or inspect fewer items.',
      );
    const value: unknown = JSON.parse(outcome.result);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new OfficeGenerationError('Invalid Office result.');
    if ('error' in value) throw new OfficeGenerationError(String(value.error));
    if (input.request.operation !== 'edit')
      return { content: value as Record<string, z.core.util.JSONType> };
    if (!('size' in value)) throw new OfficeGenerationError('Invalid edited Office file.');
    return { size: writtenSize(value.size) };
  } finally {
    if (!submitted) input.onSettled();
  }
}
