import { runInThisContext } from 'node:vm';

import {
  InsufficientScopeError,
  ProtocolError,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
} from '@modelcontextprotocol/client';

import {
  McpAuthorizationError,
  McpLegacyFallbackError,
  McpRedirectError,
} from '@/shared/contracts/mcp';
import { PluginError } from '@/shared/contracts/plugins';
import {
  attachMcpOperationStep,
  readMcpOperationStep,
  readMcpFailureFacts,
  withMcpFailureFacts,
  withMcpOperationStep,
  McpOperationError,
} from '@/shared/data/api/mcpFailureFacts';

import {
  attachMcpConnectionFailure,
  markTransportFailure,
  MCP_CONNECTION_ERROR_KIND,
  McpTimeoutError,
  normalizeMcpConnectionFailure as normalize,
  formatMcpConnectionFailureSummary as format,
} from '../mcpConnectionFailure';
import { classifyMcpCallRejection } from '../mcpProtocolClient';
import { McpRuntimeToolError } from '../mcpRuntimeAdapter';

const context = { stage: 'initialize' as const, didTimeout: false, timeoutMs: 15000 };

describe('MCP connection failure facts', () => {
  it.each([
    [new TypeError('fetch failed'), 'unknown'],
    [new TypeError('Invalid header'), 'unknown'],
    [Object.assign(new Error(), { code: 'ETIMEDOUT' }), 'timeout'],
    [new McpRuntimeToolError('mcp_tool_unavailable', 'duplicate tool identity', false), 'unknown'],
    [Object.assign(new Error(), { code: 'ECONNREFUSED' }), 'refused-or-unreachable'],
    [new McpAuthorizationError('reauthorize'), 'auth-required'],
    [new InsufficientScopeError({ requiredScope: 'secret' }), 'auth-required'],
    [new McpRedirectError('https://private.example'), 'redirect'],
    [new McpTimeoutError(), 'timeout'],
    [new SdkError(SdkErrorCode.RequestTimeout, 'secret'), 'timeout'],
    [Object.assign(new Error(), { [MCP_CONNECTION_ERROR_KIND]: 'size-limit' }), 'size-limit'],
    [
      Object.assign(new Error(), { [MCP_CONNECTION_ERROR_KIND]: 'missing-identity' }),
      'missing-identity',
    ],
    [new Error('HTTP 401 timeout size limit identity missing'), 'unknown'],
    [{ code: -32603 }, 'unknown'],
    [undefined, 'unknown'],
  ])('classifies direct and nested error %p as %s', (error, kind) => {
    expect(normalize(error, context)).toEqual({ stage: 'initialize', kind });
    expect(normalize(new Error('wrapper', { cause: error }), context)).toEqual({
      stage: 'initialize',
      kind,
    });
  });

  it.each([401, 403, 500])('retains observed HTTP %s only', (status) => {
    const error = new SdkHttpError(SdkErrorCode.EraNegotiationFailed, 'secret', { status });
    expect(normalize(error, context)).toEqual({
      stage: 'initialize',
      kind: status === 500 ? 'http-status' : 'auth-required',
      httpStatus: status,
    });
  });

  it.each([99, 600, 401.5, NaN, Infinity, '401'])('rejects invalid status %p', (status) => {
    expect(normalize({ status }, context)).toEqual({ stage: 'initialize', kind: 'unknown' });
  });

  it('prefers an observed nested HTTP status over a generic fetch failure', () => {
    expect(normalize(new TypeError('fetch failed', { cause: { status: 503 } }), context)).toEqual({
      stage: 'initialize',
      kind: 'http-status',
      httpStatus: 503,
    });
  });

  it('retains safe protocol codes only from protocol errors', () => {
    expect(normalize(new ProtocolError(-32603, 'secret'), context)).toEqual({
      stage: 'initialize',
      kind: 'protocol-handshake',
      protocolCode: -32603,
    });
    for (const code of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(normalize(new ProtocolError(code, 'secret'), context)).toEqual({
        stage: 'initialize',
        kind: 'unknown',
      });
  });

  it('keeps both fallback attempts and prefers the concrete legacy rejection', () => {
    const probe = Object.assign(new Error(), { status: 500 });
    const legacy = new ProtocolError(-32603, 'secret');
    const failure = normalize(
      new Error('outer', { cause: new McpLegacyFallbackError(probe, legacy) }),
      context,
    );
    expect(failure).toEqual({
      stage: 'initialize',
      kind: 'protocol-handshake',
      protocolCode: -32603,
      fallback: {
        negotiation: { stage: 'negotiation', kind: 'http-status', httpStatus: 500 },
        legacy: { stage: 'initialize', kind: 'protocol-handshake', protocolCode: -32603 },
      },
    });
    expect(format(failure)).toBe(
      'MCP connection failed: negotiation attempt: HTTP 500 during negotiation; legacy attempt: protocol error -32603 during initialize.',
    );
    expect(normalize(new McpLegacyFallbackError(probe, new Error('unknown')), context)).toEqual({
      stage: 'negotiation',
      kind: 'http-status',
      httpStatus: 500,
      fallback: {
        negotiation: { stage: 'negotiation', kind: 'http-status', httpStatus: 500 },
        legacy: { stage: 'initialize', kind: 'unknown' },
      },
    });
  });

  it('traverses reused dependency errors independently in each fallback branch', () => {
    const error = Object.freeze(Object.assign(new Error('private'), { code: 'ETIMEDOUT' }));
    const fallback = new McpLegacyFallbackError(error, error);
    expect(normalize(fallback, { ...context, didTimeout: true }).fallback).toEqual(
      normalize(fallback, context).fallback,
    );
    expect(normalize(fallback, context).fallback).toEqual({
      negotiation: { stage: 'negotiation', kind: 'timeout' },
      legacy: { stage: 'initialize', kind: 'timeout' },
    });
  });

  it.each([false, true])('shares facts with frontend readers on frozen=%s errors', (frozen) => {
    const error = new Error('private');
    if (frozen) Object.freeze(error);
    const facts = normalize({ code: 'ETIMEDOUT' }, context);
    attachMcpConnectionFailure(error, facts);
    expect(readMcpFailureFacts(error)).toBe(facts);
    expect(Object.keys(error)).not.toContain('connectionFailure');
    expect(facts).toEqual({ stage: 'initialize', kind: 'timeout' });
    if (!frozen)
      expect(Object.getOwnPropertyDescriptor(error, 'connectionFailure')?.value).toBe(facts);
  });

  it('keeps the first operation step on frozen errors and ignores primitives', () => {
    const error = Object.freeze(new Error('Bearer step-sentinel https://secret/#fragment'));
    attachMcpOperationStep(error, 'persistence');
    attachMcpOperationStep(error, 'authorization');
    attachMcpOperationStep('step-sentinel', 'authorization');
    expect(readMcpOperationStep(error)).toBe('persistence');
    expect(readMcpOperationStep('step-sentinel')).toBeUndefined();
    expect(JSON.stringify(readMcpOperationStep(error))).not.toMatch(
      /Bearer|sentinel|https|fragment/,
    );
  });

  it.each(['private rejection', 1730, false, null, undefined, 1730n, Symbol('private')])(
    'wraps primitive rejection %p with its step and exact cause',
    (error) => {
      const result = withMcpOperationStep(error, 'persistence');
      expect(result).toBeInstanceOf(McpOperationError);
      expect(result).toHaveProperty('cause', error);
      expect(readMcpOperationStep(result)).toBe('persistence');
      expect(readMcpOperationStep(error)).toBeUndefined();
    },
  );

  it.each([new Error('private'), Object.freeze(new Error('private')), {}])(
    'preserves fresh object rejection %p while recording its step',
    (error) => {
      expect(withMcpOperationStep(error, 'connection')).toBe(error);
      expect(readMcpOperationStep(error)).toBe('connection');
    },
  );

  it('keeps steps independent and carries safe facts through reused and wrapped rejections', () => {
    const error = Object.freeze(new Error('Bearer step-sentinel https://secret/#fragment'));
    const facts = normalize({ code: 'ETIMEDOUT' }, context);
    attachMcpConnectionFailure(error, facts);
    expect(withMcpOperationStep(error, 'connection')).toBe(error);
    const reused = withMcpOperationStep(error, 'persistence');
    expect(reused).toBeInstanceOf(McpOperationError);
    expect(reused).toHaveProperty('cause', error);
    const wrapped = withMcpOperationStep(reused, 'authorization');
    expect(wrapped).toBeInstanceOf(McpOperationError);
    expect(wrapped).toHaveProperty('cause', reused);
    expect(readMcpOperationStep(error)).toBe('connection');
    expect(readMcpOperationStep(reused)).toBe('persistence');
    expect(readMcpOperationStep(wrapped)).toBe('authorization');
    for (const rejection of [error, reused, wrapped]) {
      expect(readMcpFailureFacts(rejection)).toBe(facts);
      expect(
        JSON.stringify({
          step: readMcpOperationStep(rejection),
          facts: readMcpFailureFacts(rejection),
        }),
      ).not.toMatch(/Bearer|sentinel|https|fragment/);
    }
  });

  it('updates an existing writable property on a sealed error', () => {
    const error = new Error();
    Object.defineProperty(error, 'connectionFailure', { value: undefined, writable: true });
    Object.seal(error);
    const facts = normalize({ code: 'ETIMEDOUT' }, context);
    attachMcpConnectionFailure(error, facts);
    expect(readMcpFailureFacts(error)).toBe(facts);
    expect(Object.getOwnPropertyDescriptor(error, 'connectionFailure')?.value).toBe(facts);
  });

  it('classifies only marked fetch failures as unreachable', () => {
    const error = Object.freeze(new TypeError('private'));
    expect(normalize(error, context).kind).toBe('unknown');
    markTransportFailure(error);
    expect(normalize(error, context)).toEqual({
      stage: 'initialize',
      kind: 'refused-or-unreachable',
    });
    expect(normalize(new Error('wrapper', { cause: error }), context).kind).toBe(
      'refused-or-unreachable',
    );
    const osTimeout = new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } });
    markTransportFailure(osTimeout);
    expect(normalize(osTimeout, context)).toEqual({ stage: 'initialize', kind: 'timeout' });
    const httpError = Object.assign(new TypeError('private'), { status: 503 });
    markTransportFailure(httpError);
    expect(normalize(httpError, context)).toEqual({
      stage: 'initialize',
      kind: 'http-status',
      httpStatus: 503,
    });
  });

  it('terminates cyclic and overlong cause chains', () => {
    const cycle = new Error('secret');
    cycle.cause = cycle;
    expect(normalize(cycle, context).kind).toBe('unknown');
    let error: Error = new TypeError('fetch failed');
    for (let i = 0; i < 40; i++) error = new Error('wrapper', { cause: error });
    expect(normalize(error, context).kind).toBe('unknown');
  });

  it('uses only an observed deadline and never copies credentials', () => {
    const token = 'sk-mcp-sentinel-A9q7x2';
    const input = {
      endpointUrl: `https://example.com/mcp?key=${token}`,
      headers: { Authorization: `Bearer ${token}` },
      status: 401,
      message: token,
      code: token,
      timeoutMs: 999,
    };
    const failure = normalize(input, context);
    expect(failure).toEqual({ stage: 'initialize', kind: 'auth-required', httpStatus: 401 });
    expect(JSON.stringify(failure) + format(failure)).not.toMatch(
      /sk-mcp|sentinel|A9q7x2|Bearer|example/,
    );
    const timeout = normalize(input, { ...context, didTimeout: true });
    expect(timeout).toEqual({ stage: 'initialize', kind: 'timeout', timeoutMs: 15000 });
    expect(format(timeout)).toBe(
      'MCP connection failed: timed out after 15000ms during initialize.',
    );
    expect(
      normalize(input, { ...context, didTimeout: true, timeoutMs: Infinity }),
    ).not.toHaveProperty('timeoutMs');
  });
});

it.each([
  new McpAuthorizationError('reauthorize'),
  new McpRedirectError('https://example.com/mcp'),
  new McpLegacyFallbackError(new Error('probe'), new Error('legacy')),
  new InsufficientScopeError({ requiredScope: 'tools:read' }),
  new ProtocolError(-32602, 'invalid input'),
  new ProtocolError(-32601, 'unknown tool'),
  new ProtocolError(-32603, 'server failed'),
  new SdkHttpError(SdkErrorCode.ClientHttpAuthentication, 'unauthorized', { status: 401 }),
  new SdkHttpError(SdkErrorCode.ClientHttpNotImplemented, 'missing', { status: 404 }),
  new SdkHttpError(SdkErrorCode.ClientHttpNotImplemented, 'unavailable', { status: 503 }),
  new SdkError(SdkErrorCode.RequestTimeout, 'timeout'),
  new McpTimeoutError('deadline'),
  new McpRuntimeToolError('mcp_tool_unavailable', 'catalog integrity', false),
  new PluginError('network', 'network failed'),
  Object.freeze(Object.assign(new TypeError('socket closed'), { code: 'ECONNREFUSED' })),
])('copies %p with per-operation facts while keeping every identity/code decision', (error) => {
  const firstFacts = { stage: 'initialize' as const, kind: 'unknown' as const };
  const nextFacts = { stage: 'negotiation' as const, kind: 'unknown' as const };
  const first = withMcpFailureFacts(error, firstFacts) as typeof error;
  const next = withMcpFailureFacts(error, nextFacts) as typeof error;
  const replacement = withMcpFailureFacts(first, nextFacts) as typeof error;
  for (const copy of [first, next, replacement]) {
    expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(error));
    expect(copy).toBeInstanceOf(error.constructor);
    expect(copy.message).toBe(error.message);
    expect('code' in copy ? copy.code : undefined).toBe('code' in error ? error.code : undefined);
    expect(ProtocolError.isInstance(copy)).toBe(ProtocolError.isInstance(error));
    expect(SdkError.isInstance(copy)).toBe(SdkError.isInstance(error));
    expect(SdkHttpError.isInstance(copy)).toBe(SdkHttpError.isInstance(error));
    expect(classifyMcpCallRejection(copy)).toEqual(classifyMcpCallRejection(error));
    expect(normalize(copy, { ...context, readFacts: () => undefined })).toEqual(
      normalize(error, { ...context, readFacts: () => undefined }),
    );
  }
  expect(readMcpFailureFacts(error)).toBeUndefined();
  expect(readMcpFailureFacts(first)).toBe(firstFacts);
  expect(readMcpFailureFacts(next)).toBe(nextFacts);
  expect(readMcpFailureFacts(replacement)).toBe(nextFacts);
  expect(Object.keys(first)).not.toContain('connectionFailure');
});

it.each([undefined, null, 'cancelled', 17, false])(
  'keeps primitive rejection %p exact',
  (error) => {
    expect(withMcpFailureFacts(error, { stage: 'initialize', kind: 'unknown' })).toBe(error);
    expect(readMcpFailureFacts(error)).toBeUndefined();
  },
);

it('copies branded DOMException errors with readable name, message and code', () => {
  // The Expo environment's DOMException uses fields; Node's getters require internal slots.
  const original = globalThis.DOMException;
  globalThis.DOMException = runInThisContext('DOMException');
  try {
    const error = Object.freeze(new DOMException('socket cancelled', 'AbortError'));
    const facts = { stage: 'initialize' as const, kind: 'unknown' as const };
    const copy = withMcpFailureFacts(error, facts) as DOMException;
    expect(copy).not.toBe(error);
    expect(copy).toBeInstanceOf(DOMException);
    expect(copy.name).toBe('AbortError');
    expect(copy.message).toBe('socket cancelled');
    expect(copy.code).toBe(error.code);
    expect(readMcpFailureFacts(copy)).toBe(facts);
    expect(readMcpFailureFacts(error)).toBeUndefined();
  } finally {
    globalThis.DOMException = original;
  }
});

it('does not carry an earlier operation step across a failure-facts boundary', () => {
  const error = Object.freeze(new Error('reused'));
  attachMcpOperationStep(error, 'persistence');
  const copy = withMcpFailureFacts(error, { stage: 'initialize', kind: 'unknown' });
  expect(readMcpOperationStep(copy)).toBeUndefined();
  expect(readMcpOperationStep(error)).toBe('persistence');
});
