import * as z from 'zod';

import type { RuntimeJsonValue, RuntimeToolResult } from '@/backend/ai/agent';
import type { DevicePermissionScope, SystemPermissionState } from '@/shared/contracts';

import { createDeviceRuntimeTool } from '../deviceRuntimeTool';

const inputSchema = z.object({ id: z.string().min(1) }).strict();

describe('createDeviceRuntimeTool', () => {
  test('runs the capability once its permissions are granted', async () => {
    const run = jest.fn(async () => ({ ok: true }));
    const tool = build({ run });

    await expect(execute(tool, { id: 'event-1' })).resolves.toEqual({
      value: { ok: true },
      artifacts: [],
    });
    expect(run).toHaveBeenCalledWith({ id: 'event-1' }, expect.any(AbortSignal));
  });

  test('rechecks permission immediately before the side effect', async () => {
    // The catalog was resolved when the turn started; the user can revoke
    // access in Settings while the model is still thinking.
    const run = jest.fn();
    const tool = build({ run, status: 'denied' });

    const result = await execute(tool, { id: 'event-1' });

    expect(run).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ status: 'error', retryable: false });
  });

  test('returns a malformed call as a value the model can correct', async () => {
    const run = jest.fn();
    const tool = build({ run });

    const result = await execute(tool, { id: '' });

    expect(run).not.toHaveBeenCalled();
    // The model wrote the call, so it is worth letting it try again.
    expect(result.value).toMatchObject({ status: 'error', retryable: true });
    expect(String((result.value as { message: string }).message)).toContain('Invalid input');
  });

  test('marks a transient device failure retryable', async () => {
    const tool = build({
      run: async () => {
        throw new Error('Calendar event query timed out');
      },
    });

    const result = await execute(tool, { id: 'event-1' });

    expect(result.value).toMatchObject({ status: 'error', retryable: true });
  });

  test('marks a failure a retry cannot fix as terminal', async () => {
    const tool = build({
      run: async () => {
        throw new Error('Calendar Work is read-only');
      },
    });

    const result = await execute(tool, { id: 'event-1' });

    expect(result.value).toMatchObject({ status: 'error', retryable: false });
  });

  test('rethrows a cancellation instead of settling it as a failure', async () => {
    const controller = new AbortController();
    const tool = build({
      run: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    });

    await expect(
      tool.execute({ input: { id: 'event-1' }, signal: controller.signal, toolCallId: 'call-1' }),
    ).rejects.toThrow();
  });

  test('does not start work for an already-cancelled turn', async () => {
    const run = jest.fn();
    const controller = new AbortController();
    controller.abort();
    const tool = build({ run });

    await expect(
      tool.execute({ input: { id: 'event-1' }, signal: controller.signal, toolCallId: 'call-1' }),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
});

function build(input: {
  run: (parsed: { id: string }, signal: AbortSignal) => Promise<unknown>;
  status?: SystemPermissionState;
}) {
  return createDeviceRuntimeTool({
    capabilityId: 'calendar_delete_event',
    deps: {
      devicePermissions: {
        getStatusForScope: async (_scope: DevicePermissionScope) => input.status ?? 'granted',
      },
    },
    description: 'Delete an event.',
    displayName: 'Delete event',
    inputSchema,
    permissionScopes: ['calendar.write'],
    run: input.run,
  });
}

function execute(
  tool: ReturnType<typeof build>,
  input: RuntimeJsonValue,
): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}
