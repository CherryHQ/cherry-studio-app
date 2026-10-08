import type { JsSandbox, JsSandboxOutcome } from '@/backend/services/jsSandbox';
import type { FileEntry } from '@/shared/data/types/file';

import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import {
  createRunJsTool,
  RUN_JS_LIMITS,
  RUN_JS_OUTPUT_FILENAME,
  type RunJsFiles,
  type RunJsStore,
  toModelValue,
} from '../runJsTool';

const NO_WRITES = { set: {}, delete: [] };
const DONE = { durationMs: 3, logs: '', logsTruncated: false };
const OUTPUT_ENTRY_ID = '0198d6b2-7a40-7c4e-9f13-1f6f2b8a9c01';

describe('runJsTool', () => {
  test('runs without a deadline over the store values and returns the parsed result', async () => {
    const sandbox = createSandbox({
      status: 'ok',
      result: '{"total":42}',
      storeWrites: NO_WRITES,
      ...DONE,
    });
    const store = createStore({ cursor: 7 });

    const output = await execute(createRunJsTool({ sandbox, files: createFiles(), store }), {
      code: 'return { total: 42 }',
    });

    expect(sandbox.run).toHaveBeenCalledWith({
      code: 'return { total: 42 }',
      limits: { ...RUN_JS_LIMITS, timeoutMs: 0 },
      store: { cursor: 7 },
      signal: expect.any(AbortSignal),
    });
    expect(store.apply).not.toHaveBeenCalled();
    expect(output).toEqual({ value: { status: 'ok', result: { total: 42 } }, artifacts: [] });
  });

  test('passes the requested deadline and starts from an empty store outside a Session', async () => {
    const sandbox = createSandbox({ status: 'ok', storeWrites: NO_WRITES, ...DONE });

    await execute(createRunJsTool({ sandbox, files: createFiles() }), {
      code: 'return 1',
      timeout_ms: 5000,
    });

    expect(sandbox.run).toHaveBeenCalledWith(
      expect.objectContaining({ limits: { ...RUN_JS_LIMITS, timeoutMs: 5000 }, store: {} }),
    );
  });

  test("keeps a successful script's store writes", async () => {
    const writes = { set: { cursor: 8 }, delete: ['stale'] };
    const store = createStore({ cursor: 7, stale: true });

    await execute(
      createRunJsTool({
        sandbox: createSandbox({ status: 'ok', storeWrites: writes, ...DONE }),
        files: createFiles(),
        store,
      }),
      { code: "store('cursor', 8); store('stale', undefined)" },
    );

    expect(store.apply).toHaveBeenCalledWith(writes);
  });

  test('applies nothing for a failed script', async () => {
    const store = createStore({});

    await execute(
      createRunJsTool({
        sandbox: createSandbox({
          status: 'error',
          kind: 'exception',
          message: 'Error: boom',
          ...DONE,
        }),
        files: createFiles(),
        store,
      }),
      { code: "store('a', 1); throw new Error('boom')" },
    );

    expect(store.apply).not.toHaveBeenCalled();
  });

  test('keeps the start and end of output over budget and saves the full text as a file', async () => {
    const logs = Array.from({ length: 50 }, (_, line) => `line ${line}`).join('\n') + '\n';
    const files = createFiles();
    const tool = createRunJsTool({
      sandbox: createSandbox({
        status: 'ok',
        result: '"done"',
        storeWrites: NO_WRITES,
        ...DONE,
        logs,
      }),
      files,
    });

    const output = await execute(tool, { code: 'print lines', max_output_tokens: 25 });

    const fullText = `Returned value:\n"done"\n\nConsole output:\n${logs}`;
    expect(files.createTextEntry).toHaveBeenCalledWith(
      {
        data: fullText,
        mediaType: 'text/plain',
        name: RUN_JS_OUTPUT_FILENAME,
        provenance: 'generated',
      },
      expect.any(AbortSignal),
    );
    expect(output.artifacts).toEqual([
      {
        ref: { kind: 'managed-file', fileEntryId: OUTPUT_ENTRY_ID },
        mediaType: 'text/plain',
        name: RUN_JS_OUTPUT_FILENAME,
        kind: 'created',
      },
    ]);
    const value = output.value as { status: string; output: string; fullOutputFileEntryId: string };
    expect(value.status).toBe('ok');
    expect(value).not.toHaveProperty('result');
    expect(value).not.toHaveProperty('logs');
    expect(value.fullOutputFileEntryId).toBe(OUTPUT_ENTRY_ID);
    expect(value.output).toContain(
      `Warning: truncated output (original token count: ${Math.ceil(fullText.length / 4)})\nTotal output lines: ${fullText.split('\n').length}\n\n`,
    );
    expect(value.output).toContain(`\n\n${fullText.slice(0, 50)}…`);
    expect(value.output).toContain(`tokens truncated…${fullText.slice(-50)}`);
    expect(value.output).toContain(`read_file with file_entry_id ${OUTPUT_ENTRY_ID}`);
  });

  test('still returns the cut output when the full text cannot be saved', async () => {
    const files: RunJsFiles = {
      createTextEntry: jest.fn(async () => Promise.reject(new Error('Disk full'))),
    };
    const tool = createRunJsTool({
      sandbox: createSandbox({
        status: 'error',
        kind: 'timeout',
        message: 'The script exceeded the 5000 ms time limit and was stopped.',
        ...DONE,
        logs: 'x'.repeat(200),
      }),
      files,
    });

    const output = await execute(tool, { code: 'for (;;) print()', max_output_tokens: 10 });

    expect(output.artifacts).toEqual([]);
    expect(output.value).toMatchObject({
      status: 'error',
      kind: 'timeout',
      output: expect.stringContaining('[Could not save the full output: Disk full]'),
    });
  });

  test('rejects malformed input as a correctable value without running anything', async () => {
    const sandbox = createSandbox({ status: 'ok', storeWrites: NO_WRITES, ...DONE });

    const output = await execute(createRunJsTool({ sandbox, files: createFiles() }), {
      code: 'return 1',
      timeout_ms: 0,
    });

    expect(sandbox.run).not.toHaveBeenCalled();
    expect(output.value).toMatchObject({ status: 'error' });
  });

  test('lets cancellation reject instead of reporting a script failure', async () => {
    const reason = new Error('Aborted');
    const sandbox: JsSandbox = { run: jest.fn(async () => Promise.reject(reason)) };

    await expect(
      execute(createRunJsTool({ sandbox, files: createFiles() }), { code: 'while (true) {}' }),
    ).rejects.toBe(reason);
  });
});

describe('toModelValue', () => {
  test('omits the result when the code returned nothing', () => {
    expect(toModelValue({ status: 'ok', storeWrites: NO_WRITES, ...DONE })).toEqual({
      status: 'ok',
    });
  });

  test('hands over a cut result as text, since partial JSON cannot be parsed', () => {
    expect(
      toModelValue({
        status: 'ok',
        result: '["aaa',
        resultTruncated: true,
        storeWrites: NO_WRITES,
        ...DONE,
      }),
    ).toEqual({ status: 'ok', result: '["aaa', resultTruncated: true });
  });

  test('keeps non-JSON result text from code that replaced JSON.stringify', () => {
    expect(
      toModelValue({ status: 'ok', result: 'not json', storeWrites: NO_WRITES, ...DONE }),
    ).toEqual({ status: 'ok', result: 'not json' });
  });

  test('reports failures with their kind and keeps console output', () => {
    expect(
      toModelValue({
        status: 'error',
        kind: 'timeout',
        message: 'The script exceeded the 10000 ms time limit and was stopped.',
        durationMs: 10_000,
        logs: 'step 1\n',
        logsTruncated: true,
      }),
    ).toEqual({
      status: 'error',
      kind: 'timeout',
      message: 'The script exceeded the 10000 ms time limit and was stopped.',
      logs: 'step 1\n',
      logsTruncated: true,
    });
  });
});

function createSandbox(outcome: JsSandboxOutcome): JsSandbox & { run: jest.Mock } {
  return { run: jest.fn(async () => outcome) };
}

function createStore(values: Record<string, RuntimeJsonValue>): RunJsStore & {
  apply: jest.Mock;
} {
  return { read: jest.fn(async () => values), apply: jest.fn(async () => {}) };
}

function createFiles(): RunJsFiles & { createTextEntry: jest.Mock } {
  return {
    createTextEntry: jest.fn(
      async (input: { data: string; mediaType: string; name: string }) =>
        ({
          id: OUTPUT_ENTRY_ID,
          filename: input.name,
          mediaType: input.mediaType,
        }) as FileEntry,
    ),
  };
}

function execute(
  tool: ReturnType<typeof createRunJsTool>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({
    input,
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    turnId: 'turn-1',
  });
}
