import type { JsSandbox, JsSandboxOutcome } from '@/backend/services/jsSandbox';

import type { RuntimeJsonValue, RuntimeToolResult } from '../../runtime';
import { createRunJsTool, RUN_JS_LIMITS, toModelValue } from '../runJsTool';

const DONE = { durationMs: 3, logs: '', logsTruncated: false };

describe('runJsTool', () => {
  test('runs the code under the fixed limits and returns the parsed result', async () => {
    const sandbox = createSandbox({ status: 'ok', result: '{"total":42}', ...DONE });

    const output = await execute(createRunJsTool(sandbox), { code: 'return { total: 42 }' });

    expect(sandbox.run).toHaveBeenCalledWith(
      'return { total: 42 }',
      RUN_JS_LIMITS,
      expect.any(AbortSignal),
    );
    expect(output).toEqual({ value: { status: 'ok', result: { total: 42 } }, artifacts: [] });
  });

  test('rejects malformed input as a correctable value without running anything', async () => {
    const sandbox = createSandbox({ status: 'ok', ...DONE });

    const output = await execute(createRunJsTool(sandbox), { code: '' });

    expect(sandbox.run).not.toHaveBeenCalled();
    expect(output.value).toMatchObject({ status: 'error' });
  });

  test('lets cancellation reject instead of reporting a script failure', async () => {
    const reason = new Error('Aborted');
    const sandbox: JsSandbox = { run: jest.fn(async () => Promise.reject(reason)) };

    await expect(execute(createRunJsTool(sandbox), { code: 'while (true) {}' })).rejects.toBe(
      reason,
    );
  });
});

describe('toModelValue', () => {
  test('omits the result when the code returned nothing', () => {
    expect(toModelValue({ status: 'ok', ...DONE })).toEqual({ status: 'ok' });
  });

  test('hands over a cut result as text, since partial JSON cannot be parsed', () => {
    expect(toModelValue({ status: 'ok', result: '["aaa', resultTruncated: true, ...DONE })).toEqual(
      { status: 'ok', result: '["aaa', resultTruncated: true },
    );
  });

  test('keeps non-JSON result text from code that replaced JSON.stringify', () => {
    expect(toModelValue({ status: 'ok', result: 'not json', ...DONE })).toEqual({
      status: 'ok',
      result: 'not json',
    });
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
