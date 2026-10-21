import type { JsSandbox } from '@/backend/services/jsSandbox';

import { officeLibraryCode, officeSchedulerCode } from './createOfficeCode';
import { OfficeGenerationError, officeLimits, writtenSize } from './generateOfficeFile';
import { officeRuntimeCode } from './officePackageCode';
import type { OfficeFormat } from './officeSpec';

/** Combined size of the managed files one script may read. */
export const OFFICE_SCRIPT_MAX_INPUT_BYTES = 96 * 1024 * 1024;

const LIBRARY_NAMES: Record<OfficeFormat, string> = {
  docx: 'docx',
  xlsx: 'XLSX',
  pptx: 'PptxGenJS',
};

/** `uri` and `size` stay on the host; the script sees name, media type and lazily read bytes. */
export type OfficeScriptInput = { name: string; mediaType: string; uri: string; size: number };

/**
 * The model's script runs as an async function body beside the pinned libraries. The sandbox has
 * no app port, so the script can only read its listed inputs and compute the output file's bytes.
 */
export function createOfficeScriptCode(
  format: OfficeFormat,
  script: string,
  inputs: Readonly<Record<string, Pick<OfficeScriptInput, 'name' | 'mediaType' | 'size'>>>,
): string {
  const described = Object.fromEntries(
    Object.entries(inputs).map(([id, input], index) => [
      id,
      { name: input.name, mediaType: input.mediaType, size: input.size, index },
    ]),
  );
  return `
${officeRuntimeCode}
${officeSchedulerCode}
const ${LIBRARY_NAMES[format]} = ${officeLibraryCode(format)};
const inputs = (() => {
  const target = {};
  for (const [id, { index, ...input }] of Object.entries(${JSON.stringify(described)})) {
    let base64;
    // Read on first use: a script may list files it only inspects conditionally.
    target[id] = Object.defineProperties(input, {
      bytes: { enumerable: true, get: () => readInput(index) },
      base64: { enumerable: true, get: () => base64 ??= base64Of(input.bytes) },
    });
  }
  return new Proxy(target, {
    get(target, id) {
      if (typeof id === 'string' && id !== 'then' && !(id in target)) throw new Error('inputs["' + id + '"] is unavailable; list that file id in the inputs argument.');
      return target[id];
    },
  });
})();
const output = await (async () => {
${script}
})();
if (output === undefined || output === null) return null;
return saveOffice(output, '${format}', true);
`;
}

/** Runs the script; a returned file is written to `output` and its size reported. */
export async function runOfficeScript(input: {
  format: OfficeFormat;
  script: string;
  inputs: Readonly<Record<string, OfficeScriptInput>>;
  output: string;
  sandbox: JsSandbox;
  signal: AbortSignal;
  onSettled: () => void;
}): Promise<{ size: number | null; logs: string }> {
  let submitted = false;
  try {
    input.signal.throwIfAborted();
    const code = createOfficeScriptCode(input.format, input.script, input.inputs);
    const files = Object.values(input.inputs);
    submitted = true;
    const outcome = await input.sandbox.run({
      code,
      files: { inputs: files.map((file) => file.uri), output: input.output },
      signal: input.signal,
      onSettled: input.onSettled,
      limits: {
        ...officeLimits(files.reduce((total, file) => total + file.size, 0)),
        maxLogBytes: 16 * 1024,
      },
    });
    input.signal.throwIfAborted();
    if (outcome.status === 'error') {
      // The model fixes its own script, so it needs the engine's message and its console output.
      const logs = outcome.logs ? `\nConsole:\n${outcome.logs}` : '';
      const advice =
        outcome.kind === 'memory'
          ? ' Rewriting the script cannot raise this limit: process fewer or smaller files per run, and avoid copying whole files or keeping several decoded copies at once.'
          : '';
      throw new OfficeGenerationError(
        `Script failed (${outcome.kind}): ${outcome.message.slice(0, 2000)}${advice}${logs}`,
      );
    }
    // A script that returns nothing only inspected its inputs.
    const size =
      outcome.result === 'null' ? null : writtenSize(outcome.result && JSON.parse(outcome.result));
    return { size, logs: outcome.logs };
  } finally {
    if (!submitted) input.onSettled();
  }
}
