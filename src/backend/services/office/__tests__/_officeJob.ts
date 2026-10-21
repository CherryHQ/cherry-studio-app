import { runInNewContext } from 'node:vm';

function filesOver(inputs: readonly Uint8Array[]) {
  const written: { output?: Uint8Array } = {};
  const __files = {
    read(index: number) {
      const input = inputs[index];
      if (!input) throw new RangeError('No input file has this index.');
      return new Uint8Array(input).buffer;
    },
    write(bytes: Uint8Array) {
      written.output = bytes.slice();
      return bytes.length;
    },
  };
  return { written, context: { queueMicrotask, atob, btoa, __files } };
}

/**
 * Runs an Office job in node:vm with `__files` over in-memory inputs, returning the job's value and
 * the bytes it wrote. This checks the code contract without DOM, Node modules, Buffer or timers in
 * its context; QuickJS limits and the native file I/O remain device acceptance.
 */
export async function runOfficeJob(
  code: string,
  inputs: readonly Uint8Array[] = [],
): Promise<{ value: unknown; output?: Uint8Array }> {
  const { written, context } = filesOver(inputs);
  const value: unknown = await runInNewContext(`(async () => { ${code} })()`, context, {
    timeout: 10_000,
  });
  return { value, output: written.output };
}

/** `runOfficeJob` for package transforms, which finish synchronously. */
export function runOfficeJobSync(
  code: string,
  inputs: readonly Uint8Array[] = [],
): { value: unknown; output?: Uint8Array } {
  const { written, context } = filesOver(inputs);
  const value: unknown = runInNewContext(`(() => { ${code} })()`, context, { timeout: 10_000 });
  return { value, output: written.output };
}
