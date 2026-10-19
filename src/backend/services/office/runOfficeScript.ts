import { fromByteArray } from 'base64-js';

import type { JsSandbox } from '@/backend/services/jsSandbox';

import { officeLibraryCode, officeSchedulerCode } from './createOfficeCode';
import {
  decodeOfficeResult,
  OfficeGenerationError,
  OFFICE_MAX_OUTPUT_BYTES,
} from './generateOfficeFile';
import {
  officeTextEncoderCode,
  officeZipLibraryCode,
  officeXmlLibraryCode,
} from './officePackageCode';
import type { OfficeFormat } from './officeSpec';

/** Combined size of the managed files one script may read. */
export const OFFICE_SCRIPT_MAX_INPUT_BYTES = 6 * 1024 * 1024;

const LIBRARY_NAMES: Record<OfficeFormat, string> = {
  docx: 'docx',
  xlsx: 'XLSX',
  pptx: 'PptxGenJS',
};

const MAIN_PARTS: Record<OfficeFormat, string> = {
  docx: 'word/document.xml',
  xlsx: 'xl/workbook.xml',
  pptx: 'ppt/presentation.xml',
};

export type OfficeScriptInput = { name: string; mediaType: string; data: Uint8Array };

/**
 * The model's script runs as an async function body beside the pinned libraries. The sandbox has
 * no app port, so the script can only compute bytes; the caller publishes them as a new file.
 */
export function createOfficeScriptCode(
  format: OfficeFormat,
  script: string,
  inputs: Readonly<Record<string, OfficeScriptInput>>,
): string {
  const encoded = Object.fromEntries(
    Object.entries(inputs).map(([id, input]) => [
      id,
      { name: input.name, mediaType: input.mediaType, base64: fromByteArray(input.data) },
    ]),
  );
  return `
${officeTextEncoderCode}
${officeSchedulerCode}
${officeZipLibraryCode}
${officeXmlLibraryCode}
const ${LIBRARY_NAMES[format]} = ${officeLibraryCode(format)};
const inputs = new Proxy(${JSON.stringify(encoded)}, {
  get(target, id) {
    if (typeof id === 'string' && id !== 'then' && !(id in target)) throw new Error('inputs["' + id + '"] is unavailable; list that file id in the inputs argument.');
    return target[id];
  },
});
for (const input of Object.values(inputs)) {
  let bytes;
  Object.defineProperty(input, 'bytes', { get: () => bytes ??= Uint8Array.from(atob(input.base64), c => c.charCodeAt(0)) });
}
const output = await (async () => {
${script}
})();
if (output === undefined || output === null) return null;
let bytes;
if (typeof output === 'string') bytes = Uint8Array.from(atob(output), c => c.charCodeAt(0));
else if (output instanceof ArrayBuffer) bytes = new Uint8Array(output);
else if (ArrayBuffer.isView(output)) bytes = new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
else throw new Error('Return the ${format.toUpperCase()} file as a base64 string, Uint8Array or ArrayBuffer.');
if (bytes.length > ${OFFICE_MAX_OUTPUT_BYTES}) throw new Error('The returned file exceeds 4 MiB.');
let parts;
try { parts = zip.unzipSync(bytes); }
catch { throw new Error('The returned value is not a ZIP package.'); }
if (!parts['${MAIN_PARTS[format]}']) throw new Error('The returned package is not a ${format.toUpperCase()} file: ${MAIN_PARTS[format]} is missing.');
// Hand-edited package XML is the common way to corrupt a file; refuse it before it is saved.
// Parts over 1 MiB are skipped to keep large sheets within the run's memory and time budget.
for (const [name, data] of Object.entries(parts)) {
  if (!/[.](xml|rels)$/.test(name) || data.length > 1048576) continue;
  let problem;
  try {
    new xml.DOMParser({ onError: (level, message) => { if (level !== 'warning') problem ??= message; } })
      .parseFromString(zip.strFromU8(data), 'application/xml');
  } catch (error) { problem ??= String(error && error.message || error); }
  if (problem) throw new Error('Invalid XML in ' + name + ': ' + problem);
}
let binary = '';
for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
return btoa(binary);
`;
}

export async function runOfficeScript(input: {
  format: OfficeFormat;
  script: string;
  inputs: Readonly<Record<string, OfficeScriptInput>>;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<{ data: Uint8Array | null; logs: string }> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    const code = createOfficeScriptCode(input.format, input.script, input.inputs);
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        timeoutMs: 30_000,
        memoryBytes: 64 * 1024 * 1024,
        maxResultBytes: Math.ceil(OFFICE_MAX_OUTPUT_BYTES / 3) * 4 + 2,
        maxLogBytes: 16 * 1024,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error') {
      // The model fixes its own script, so it needs the engine's message and its console output.
      const logs = outcome.logs ? `\nConsole:\n${outcome.logs}` : '';
      throw new OfficeGenerationError(
        `Script failed (${outcome.kind}): ${outcome.message.slice(0, 2000)}${logs}`,
      );
    }
    // A script that returns nothing only inspected its inputs.
    const data = outcome.result === 'null' ? null : decodeOfficeResult(outcome);
    return { data, logs: outcome.logs };
  } finally {
    if (!submitted) input.onSettled();
  }
}
