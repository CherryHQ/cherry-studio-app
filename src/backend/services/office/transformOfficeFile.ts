import { fromByteArray, toByteArray } from 'base64-js';
import type * as z from 'zod';

import type { JsSandbox } from '@/backend/services/jsSandbox';

import { OfficeGenerationError, OFFICE_MAX_OUTPUT_BYTES } from './generateOfficeFile';
import type { OfficeTransformRequest } from './officeEditSpec';
import {
  officeTextEncoderCode,
  officeZipLibraryCode,
  officeXmlLibraryCode,
} from './officePackageCode';
import { officeTransformCode } from './officeTransformCode';

export function createOfficeTransformCode(
  bytes: Uint8Array,
  request: OfficeTransformRequest,
): string {
  return `
${officeTextEncoderCode}
${officeZipLibraryCode}
${officeXmlLibraryCode}
const request = ${JSON.stringify(request)};
const sourceBase64 = ${JSON.stringify(fromByteArray(bytes))};
try { return (() => { ${officeTransformCode} })(); }
catch (error) { return { error: String(error.message || error).slice(0, 500) }; }
`;
}

export async function transformOfficeFile(input: {
  bytes: Uint8Array;
  request: OfficeTransformRequest;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<{ data: Uint8Array } | { content: Record<string, z.core.util.JSONType> }> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    if (input.bytes.length > OFFICE_MAX_OUTPUT_BYTES)
      throw new OfficeGenerationError('Source Office file exceeds 4 MiB.');
    const code = createOfficeTransformCode(input.bytes, input.request);
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        timeoutMs: 30_000,
        memoryBytes: 64 * 1024 * 1024,
        maxResultBytes:
          input.request.operation === 'edit'
            ? Math.ceil(OFFICE_MAX_OUTPUT_BYTES / 3) * 4 + 100
            : 128 * 1024,
        maxLogBytes: 1024,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error')
      throw new OfficeGenerationError(`Office operation failed (${outcome.kind}).`);
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
    if (
      !('data' in value) ||
      typeof value.data !== 'string' ||
      value.data.length > Math.ceil(OFFICE_MAX_OUTPUT_BYTES / 3) * 4 ||
      value.data.length % 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
    )
      throw new OfficeGenerationError('Invalid edited Office file.');
    const data = toByteArray(value.data);
    if (
      data.length > OFFICE_MAX_OUTPUT_BYTES ||
      data[0] !== 0x50 ||
      data[1] !== 0x4b ||
      data[2] !== 3 ||
      data[3] !== 4
    )
      throw new OfficeGenerationError('Invalid edited Office package.');
    return { data };
  } finally {
    if (!submitted) input.onSettled();
  }
}
