import type { Context } from '@earendil-works/chord';
import type { ToolExecutionApi, ToolExecutionResult } from '@earendil-works/pi-durable';
import { CodemodeStoreDoc } from '@earendil-works/pi-durable/codemode';

// Pi 1.5's native entry does not export its store limits. Match its 256 Ki-character
// JSON value limit and reserve 256 Ki characters in the 1 Mi-character store for scripts/receipts.
const MAX_OUTPUT_JSON_CHARACTERS = 256 * 1024;
const MAX_OUTPUT_STORE_CHARACTERS = 3 * MAX_OUTPUT_JSON_CHARACTERS;

/** Console overflow is private working data, not a file-library artifact. */
export async function retainPiCodemodeOutput(
  name: string,
  text: string,
  api: ToolExecutionApi,
  context: Context,
): Promise<{ path: string } | { error: string }> {
  // Avoid serializing text already known to exceed the limit.
  const outputCharacters =
    text.length > MAX_OUTPUT_JSON_CHARACTERS ? text.length : JSON.stringify(text).length;
  if (outputCharacters > MAX_OUTPUT_JSON_CHARACTERS)
    return { error: 'Text output exceeds the working cache limit. Print a smaller result.' };
  const key = `codemode-output:${api.taskId}:${name}`;
  return api.commit(async (tx) => {
    const store = await tx.doc(CodemodeStoreDoc, api.conversationId);
    if (store.values[key] === undefined) {
      const characters = Object.entries(store.values).reduce(
        (total, [name, value]) => total + name.length + JSON.stringify(value).length,
        key.length + outputCharacters,
      );
      if (characters > MAX_OUTPUT_STORE_CHARACTERS)
        return { error: 'Working cache has no room for this output. Print a smaller result.' };
      // CodemodeSandboxBase serializes JsonValues before load() sees them; retain the raw text.
      store.values[key] = text;
    }
    return { path: `store:${key}` };
  }, context);
}

const SCRIPT_ERROR = 'Script error:\n';
const FAILURE_KINDS = [
  ['Script timed out: ', 'script_timeout'],
  ['Script aborted: ', 'script_aborted'],
  ['Script sandbox failed: ', 'sandbox_failed'],
] as const;

/**
 * The diagnostic cause of a failed script. Its structured error stays inside Code Mode, so this
 * reads the failure upstream formats for the model; output cut before it keeps `script_failed`.
 */
export function piCodemodeFailureCode(result: ToolExecutionResult): string {
  const text = (result.output ?? [])
    .flatMap((item) => (item.type === 'text' ? [item.text] : []))
    .join('\n');
  const start = text.lastIndexOf(SCRIPT_ERROR);
  if (start === -1) return 'script_failed';
  const head = text.slice(start + SCRIPT_ERROR.length);
  for (const [prefix, code] of FAILURE_KINDS) if (head.startsWith(prefix)) return code;
  // A failed child may have been caught before an unrelated script exception.
  // Call statuses do not establish the cause of the terminating error.
  return 'script_error';
}
