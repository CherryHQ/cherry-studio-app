import { McpAuthorizationError } from '@/shared/contracts/mcp';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import { attachMcpOperationStep, withMcpOperationStep } from '@/shared/data/api/mcpFailureFacts';

import { runMcpConnectionProbe, runMcpSaveWorkflow } from '../mcpSaveWorkflow';

function dependencies() {
  return {
    validate: jest.fn((): { ok: true } | { ok: false; errorKey: string } => ({ ok: true })),
    probe: jest.fn(async (_operation: object) => {}),
    persist: jest.fn(async (_operation: object) => {}),
    grantCleanup: jest.fn(async () => {}),
  };
}

it.each(['primitive database failure', Object.freeze(new Error('frozen database failure'))])(
  'uses the OAuth operation persistence wrapper and exposes its original cause: %p',
  async (error) => {
    const deps = dependencies();
    // A stale annotation on a reused rejection cannot override this operation's wrapper.
    attachMcpOperationStep(error, 'connection');
    deps.persist.mockImplementation(async (operation) => {
      throw withMcpOperationStep(error, 'persistence', operation);
    });
    const result = await runMcpSaveWorkflow(deps);
    expect(result).toEqual({ ok: false, step: 'persistence', error });
    if (!result.ok) expect(result.error).toBe(error);
    expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
  },
);

it('keeps the original authorization error type inside an operation wrapper', async () => {
  const deps = dependencies();
  const error = new McpAuthorizationError('cancelled');
  deps.persist.mockImplementation(async (operation) => {
    throw withMcpOperationStep(error, 'authorization', operation);
  });
  const result = await runMcpSaveWorkflow(deps);
  expect(result).toEqual({ ok: false, step: 'authorization', error });
  if (!result.ok) expect(result.error).toBeInstanceOf(McpAuthorizationError);
});

it('stops at validation before probing or writing', async () => {
  const deps = dependencies();
  const error = { ok: false as const, errorKey: 'settings.mcp.fields.endpointUrlInvalid' };
  deps.validate.mockReturnValue(error);
  expect(await runMcpSaveWorkflow(deps)).toEqual({ ok: false, step: 'validation', error });
  expect(deps.probe).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
});

it('reports a thrown validation error by identity', async () => {
  const deps = dependencies();
  const error = Object.freeze(new Error('schema'));
  deps.validate.mockImplementation(() => {
    throw error;
  });
  const result = await runMcpSaveWorkflow(deps);
  expect(result).toEqual({ ok: false, step: 'validation', error });
  if (!result.ok) expect(result.error).toBe(error);
});

it('stops at a failed probe and cleans up the grant', async () => {
  const deps = dependencies();
  const error = new McpAuthorizationError('reauthorize');
  deps.probe.mockRejectedValue(error);
  const result = await runMcpSaveWorkflow(deps);
  expect(result).toEqual({ ok: false, step: 'connection', error });
  if (!result.ok) expect(result.error).toBe(error);
  expect(deps.persist).not.toHaveBeenCalled();
  expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
});

it.each(['duplicate-name', 'connection-changed'])(
  'reports persistence %s after a successful probe',
  async (reason) => {
    const deps = dependencies();
    const order: string[] = [];
    const error = new DataApiError(ErrorCode.CONFLICT, 'private', { reason });
    deps.probe.mockImplementation(async () => {
      order.push('probe');
    });
    deps.persist.mockImplementation(async () => {
      order.push('persist');
      throw error;
    });
    const result = await runMcpSaveWorkflow(deps);
    expect(order).toEqual(['probe', 'persist']);
    expect(result).toEqual({ ok: false, step: 'persistence', error });
    if (!result.ok) expect(result.error).toBe(error);
    expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
  },
);

it('reports an authorization grant failure and cleans up', async () => {
  const deps = dependencies();
  const error = new Error('grant');
  const result = await runMcpSaveWorkflow({
    ...deps,
    authorize: async () => {
      throw error;
    },
  });
  expect(result).toEqual({ ok: false, step: 'authorization', error });
  expect(deps.probe).not.toHaveBeenCalled();
  expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
});

it('quietly cancels without probing or writing and cleans up', async () => {
  const deps = dependencies();
  expect(await runMcpSaveWorkflow({ ...deps, authorize: async () => false })).toEqual({ ok: true });
  expect(deps.probe).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
  expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
});

it.each(['authorization', 'connection', 'persistence'] as const)(
  'uses the combined OAuth operation code position: %s',
  async (step) => {
    const deps = dependencies();
    const error = Object.freeze(new Error('storage or grant'));
    deps.persist.mockImplementation(async (operation) => {
      throw withMcpOperationStep(error, step, operation);
    });
    const result = await runMcpSaveWorkflow(deps);
    expect(result).toEqual({ ok: false, step, error });
    if (!result.ok) expect(result.error).toBe(error);
  },
);

it('attributes grant cleanup failure to persistence', async () => {
  const deps = dependencies();
  const error = new Error('cleanup');
  deps.grantCleanup.mockRejectedValue(error);
  expect(await runMcpSaveWorkflow(deps)).toEqual({ ok: false, step: 'persistence', error });
});

it('preserves the primary failure if cleanup fails too', async () => {
  const deps = dependencies();
  const error = new Error('probe');
  deps.probe.mockRejectedValue(error);
  deps.grantCleanup.mockRejectedValue(new Error('cleanup'));
  expect(await runMcpSaveWorkflow(deps)).toEqual({ ok: false, step: 'connection', error });
});

it('uses the persistence marker when grant storage fails during authorization', async () => {
  const deps = dependencies();
  const error = Object.freeze(new Error('grant write'));
  // Only a marker produced within this authorization operation can report grant persistence.
  const result = await runMcpSaveWorkflow({
    ...deps,
    authorize: async (operation) => {
      throw withMcpOperationStep(error, 'persistence', operation);
    },
  });
  expect(result).toEqual({ ok: false, step: 'persistence', error });
  expect(deps.probe).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
});

it('keeps the authorization position for a thrown primitive', async () => {
  const deps = dependencies();
  const error = 'private primitive';
  attachMcpOperationStep(error, 'persistence');
  expect(
    await runMcpSaveWorkflow({
      ...deps,
      authorize: async () => {
        throw error;
      },
    }),
  ).toEqual({ ok: false, step: 'authorization', error });
  expect(deps.probe).not.toHaveBeenCalled();
  expect(deps.persist).not.toHaveBeenCalled();
});

it.each(['private primitive', 1730, false, null, undefined, Object.freeze(new Error('private'))])(
  'attributes a fact-less OAuth completion probe rejection to connection: %p',
  async (error) => {
    const deps = dependencies();
    const completeOAuth = jest.fn().mockRejectedValue(error);
    deps.persist.mockImplementation(async (operation) => {
      await runMcpConnectionProbe(completeOAuth(), operation);
    });
    // Cleanup must neither mask the probe failure nor keep its original cause from the caller.
    deps.grantCleanup.mockRejectedValue(new Error('cleanup'));
    const result = await runMcpSaveWorkflow(deps);
    expect(result).toEqual({ ok: false, step: 'connection', error });
    if (!result.ok) expect(result.error).toBe(error);
    expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
  },
);

it.each(['validation', 'authorization', 'connection', 'persistence'] as const)(
  'prefers the original OAuth completion marker over the probe fallback: %s',
  async (step) => {
    const deps = dependencies();
    const error = Object.freeze(new Error('private'));
    deps.persist.mockImplementation(async (operation) => {
      await runMcpConnectionProbe(
        Promise.reject(withMcpOperationStep(error, step, operation)),
        operation,
      );
    });
    const result = await runMcpSaveWorkflow(deps);
    expect(result).toEqual({ ok: false, step, error });
    if (!result.ok) expect(result.error).toBe(error);
  },
);

it('keeps a failure after OAuth completion in persistence', async () => {
  const deps = dependencies();
  const connected = { id: 'connected-server' };
  const error = 'private write failure';
  deps.persist.mockImplementation(async (operation) => {
    expect(await runMcpConnectionProbe(Promise.resolve(connected), operation)).toBe(connected);
    throw error;
  });
  expect(await runMcpSaveWorkflow(deps)).toEqual({ ok: false, step: 'persistence', error });
  expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
});

it.each(['validation', 'authorization', 'connection', 'persistence'] as const)(
  'ignores an earlier operation marker in the %s phase',
  async (phase) => {
    const deps = dependencies();
    const error = Object.freeze(new Error('private'));
    // A reused rejection must report the phase that threw it, never its earlier marker.
    const step = phase === 'persistence' ? 'authorization' : 'persistence';
    attachMcpOperationStep(error, step);
    const fail = () => {
      throw error;
    };
    if (phase === 'validation') deps.validate.mockImplementation(fail);
    if (phase === 'connection') deps.probe.mockImplementation(fail);
    if (phase === 'persistence') deps.persist.mockImplementation(fail);
    const result = await runMcpSaveWorkflow({
      ...deps,
      authorize: phase === 'authorization' ? fail : undefined,
    });
    expect(result).toEqual({ ok: false, step: phase, error });
    expect(deps.grantCleanup).toHaveBeenCalledTimes(1);
  },
);

it.each(['authorization', 'connection', 'persistence'] as const)(
  'ignores an earlier operation wrapper in the %s phase',
  async (phase) => {
    const deps = dependencies();
    const error = Object.freeze(new Error('reused wrapper cause'));
    attachMcpOperationStep(error, 'validation');
    const rejection = withMcpOperationStep(error, 'validation', {});
    const fail = async () => {
      throw rejection;
    };
    if (phase === 'connection') deps.probe.mockImplementation(fail);
    if (phase === 'persistence') deps.persist.mockImplementation(fail);
    const result = await runMcpSaveWorkflow({
      ...deps,
      authorize: phase === 'authorization' ? fail : undefined,
    });
    expect(result).toEqual({ ok: false, step: phase, error });
  },
);

it('does not reuse a marker produced by an earlier phase of the same save', async () => {
  const deps = dependencies();
  const error = Object.freeze(new Error('reused across phases'));
  deps.probe.mockRejectedValue(error);
  const result = await runMcpSaveWorkflow({
    ...deps,
    authorize: async (operation) => {
      withMcpOperationStep(error, 'persistence', operation);
      return true;
    },
  });
  expect(result).toEqual({ ok: false, step: 'connection', error });
});
