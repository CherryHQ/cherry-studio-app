import { createInstance } from 'i18next';

import en from '@/frontend/i18n/locales/en-us.json';
import {
  McpAuthorizationError,
  McpRedirectError,
  type McpConnectionFailure,
  type McpFailureKind,
  type McpFailureStage,
} from '@/shared/contracts/mcp';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import { attachMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';

import {
  describeConnectionFailure,
  describeMcpActionFailure,
  describeSaveFailure,
  readConnectionFailure,
} from '../mcpFailureMessages';
import { runMcpConnectionProbe, runMcpSaveWorkflow } from '../mcpSaveWorkflow';

const i18n = createInstance();
beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    keySeparator: false,
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});
const t = i18n.t;
const failure = (
  kind: McpFailureKind = 'timeout',
  stage: McpFailureStage = 'initialize',
): McpConnectionFailure => ({ kind, stage });
const thrown = (facts: McpConnectionFailure) => {
  const error = new Error('private diagnostic');
  attachMcpFailureFacts(error, facts);
  return error;
};

// Record exhaustiveness makes newly added contract members require an expected rendering.
const kinds = {
  'catalog-integrity':
    'Server returned an inconsistent tool catalog (duplicate tool identity or repeated page cursor)',
  timeout: 'Connection timed out',
  'refused-or-unreachable': 'Server refused the connection or could not be reached',
  'http-status': 'Server returned an HTTP error',
  'protocol-handshake': 'Protocol handshake failed',
  'auth-required': 'Authorization is required',
  redirect:
    'Server redirected the request. Update the endpoint address to the final address and try again.',
  'size-limit': 'Server response exceeded the size limit',
  'missing-identity': 'Server did not provide its identity',
  unknown: 'Connection failed',
} satisfies Record<McpFailureKind, string>;
const stages = {
  negotiation: 'protocol negotiation',
  initialize: 'initialization',
  'tools-list': 'tool listing',
} satisfies Record<McpFailureStage, string>;

it.each(Object.entries(kinds))('renders kind %s in every stage', (kind, reason) => {
  for (const [stage, label] of Object.entries(stages)) {
    expect(
      describeConnectionFailure(failure(kind as McpFailureKind, stage as McpFailureStage), t),
    ).toBe(
      `${kind === 'protocol-handshake' && stage === 'tools-list' ? 'Server returned an invalid tool listing' : reason} (during ${label})`,
    );
  }
});

it('interpolates status, protocol code, and timeout facts', () => {
  expect(describeConnectionFailure({ ...failure('auth-required'), httpStatus: 401 }, t)).toBe(
    'Authorization is required or access was denied (HTTP 401) (during initialization)',
  );
  expect(
    describeConnectionFailure({ ...failure('protocol-handshake'), protocolCode: -32600 }, t),
  ).toBe('Protocol handshake failed (code -32600) (during initialization)');
  expect(describeConnectionFailure({ ...failure(), timeoutMs: 12000 }, t)).toBe(
    'Connection timed out after 12000 ms (during initialization)',
  );
});

it('explains both fallback attempts with their own stages and facts', () => {
  const facts: McpConnectionFailure = {
    ...failure(),
    fallback: {
      negotiation: { ...failure('http-status', 'negotiation'), httpStatus: 404 },
      legacy: { ...failure('timeout', 'tools-list'), timeoutMs: 5000 },
    },
  };
  expect(describeConnectionFailure(readConnectionFailure(thrown(facts))!, t)).toBe(
    'Negotiated connection: Server returned HTTP 404 (during protocol negotiation). Legacy connection: Connection timed out after 5000 ms (during tool listing).',
  );
});

it.each([false, true])('renders shared facts on errors (frozen: %s)', (frozen) => {
  const error = frozen ? Object.freeze(new Error('private')) : new Error('private');
  attachMcpFailureFacts(error, failure());
  expect(describeSaveFailure('connection', error, t)).toBe(
    'Connection check failed: Connection timed out (during initialization)',
  );
});

it('reads nested causes and handles cycles', () => {
  const error = new Error('outer', { cause: new Error('middle', { cause: thrown(failure()) }) });
  expect(describeSaveFailure('connection', error, t)).toContain(
    'Connection timed out (during initialization)',
  );
  const cyclic = { cause: {} };
  cyclic.cause = cyclic;
  expect(readConnectionFailure(cyclic)).toBeUndefined();
});

it('prefers observed probe facts over the authorization error class', () => {
  const error = new McpAuthorizationError('reauthorize');
  attachMcpFailureFacts(error, { ...failure('auth-required', 'tools-list'), httpStatus: 403 });
  expect(describeSaveFailure('connection', error, t)).toBe(
    'Connection check failed: Authorization is required or access was denied (HTTP 403) (during tool listing)',
  );
});

it.each([
  null,
  undefined,
  'error',
  new Error('bad server name'),
  { connectionFailure: {} },
  { connectionFailure: { stage: 'bad', kind: 'timeout' } },
])('ignores missing or malformed facts: %p', (error) => {
  expect(readConnectionFailure(error)).toBeUndefined();
});

it('uses the generic reason for a future kind', () => {
  const facts = { stage: 'initialize', kind: 'future-kind' } as unknown as McpConnectionFailure;
  expect(describeConnectionFailure(facts, t)).toBe('Connection failed (during initialization)');
  expect(readConnectionFailure(thrown(facts))?.kind).toBe('unknown');
});

it('names each save step and distinguishes remote errors from persistence conflicts', () => {
  expect(describeSaveFailure('validation', new Error('private'), t)).toBe(
    'Validation failed: Check the server fields',
  );
  expect(
    describeSaveFailure('validation', { errorKey: 'settings.mcp.fields.endpointUrlInvalid' }, t),
  ).toBe(`Validation failed: ${en['settings.mcp.fields.endpointUrlInvalid']}`);
  expect(
    describeSaveFailure('validation', { errorKey: 'settings.mcp.fields.headersInvalid' }, t),
  ).toBe(`Validation failed: ${en['settings.mcp.fields.headersInvalid']}`);
  expect(describeSaveFailure('authorization', new McpAuthorizationError('reauthorize'), t)).toBe(
    `Authorization failed: ${en['settings.mcp.oauth.errors.reauthorize']}`,
  );
  expect(describeSaveFailure('authorization', new Error('private'), t)).toBe(
    'Authorization failed: Authorization failed',
  );
  for (const httpStatus of [401, 409]) {
    const kind = httpStatus === 401 ? 'auth-required' : 'http-status';
    const error = thrown({ ...failure(kind, 'initialize'), httpStatus });
    expect(describeSaveFailure('connection', error, t)).toBe(
      `Connection check failed: ${httpStatus === 401 ? 'Authorization is required or access was denied (HTTP 401)' : 'Server returned HTTP 409'} (during initialization)`,
    );
    expect(describeSaveFailure('persistence', error, t)).toBe(
      'Saving settings failed: Could not write the server settings',
    );
  }
  expect(describeSaveFailure('connection', new Error('private'), t)).toBe(
    'Connection check failed: Connection failed',
  );
  expect(
    describeSaveFailure(
      'persistence',
      new DataApiError(ErrorCode.CONFLICT, 'private', { reason: 'duplicate-name' }),
      t,
    ),
  ).toBe('Saving settings failed: A server with this name already exists');
  expect(
    describeSaveFailure('persistence', new DataApiError(ErrorCode.VALIDATION_ERROR, 'private'), t),
  ).toBe('Saving settings failed: Check the server fields');
  for (const code of Object.values(ErrorCode).filter(
    (code) => code !== ErrorCode.CONFLICT && code !== ErrorCode.VALIDATION_ERROR,
  )) {
    expect(describeSaveFailure('persistence', new DataApiError(code, 'private'), t)).toBe(
      'Saving settings failed: Could not write the server settings',
    );
  }
});

it.each([
  '',
  '   ',
  'invalid-url',
  'javascript:SECRET_TOKEN_1730',
  'file:///SECRET_TOKEN_1730',
  'https://target.example/SECRET_TOKEN_1730',
  'https://user:pass@target.example/mcp?token=SECRET_TOKEN_1730#PRIVATE_FRAGMENT',
  'https://SECRET_TOKEN_1730.target.example:8443/mcp',
  'https://例子.测试:9443/mcp',
])('omits the entire redirect target from %s', (location) => {
  const redirect = new McpRedirectError(location);
  const rendered = [
    describeSaveFailure('connection', redirect, t),
    describeSaveFailure('authorization', redirect, t),
    describeMcpActionFailure('enable', redirect, t),
  ];
  expect(rendered).toEqual([
    `Connection check failed: ${kinds.redirect}`,
    `Authorization failed: ${kinds.redirect}`,
    `Enabling the server failed: ${kinds.redirect}`,
  ]);
  for (const result of rendered) {
    for (const target of [
      'SECRET_TOKEN_1730',
      'user:pass@',
      'PRIVATE_FRAGMENT',
      'target.example',
      '8443',
      '9443',
      '例子',
      '测试',
      'xn--',
      'javascript:',
      'file:',
    ])
      expect(result).not.toContain(target);
  }
  expect(redirect.location).toBe(location);
});

it('localizes all authorization codes', () => {
  const codes = [
    'configuration',
    'unavailable',
    'cancelled',
    'network',
    'reauthorize',
    'invalid_response',
  ] as const;
  for (const code of codes) {
    const result = describeSaveFailure('authorization', new McpAuthorizationError(code), t);
    expect(result).toMatch(/^Authorization failed: /);
    expect(result).not.toContain('settings.mcp');
  }
});

it.each([
  ['disconnect', 'Disconnecting authorization failed'],
  ['enable', 'Enabling the server failed'],
  ['disable', 'Disabling the server failed'],
  ['tool-toggle', 'Changing tool availability failed'],
] as const)('names action %s', (action, label) => {
  expect(describeMcpActionFailure(action, new Error('private'), t)).toBe(
    `${label}: Could not write the server settings`,
  );
  expect(describeMcpActionFailure(action, thrown(failure()), t)).toBe(
    `${label}: Connection timed out (during initialization)`,
  );
});

it('never renders tokens from messages, URLs, unknown kinds, or malformed numeric facts', () => {
  const token = 'SECRET_TOKEN_1730';
  const url = `https://example.com/${token}?Authorization=Bearer_${token}#PRIVATE_FRAGMENT`;
  const errors = [
    new Error(url),
    new McpRedirectError(url),
    new DataApiError(ErrorCode.CONFLICT, url),
    { connectionFailure: { stage: 'initialize', kind: token } },
    { connectionFailure: { stage: 'initialize', kind: 'http-status', httpStatus: token } },
  ];
  for (const error of errors) {
    for (const step of ['validation', 'authorization', 'connection', 'persistence'] as const) {
      const rendered = describeSaveFailure(step, error, t);
      for (const secret of [token, 'Authorization=', 'Bearer_', 'PRIVATE_FRAGMENT', '/mcp?', url])
        expect(rendered).not.toContain(secret);
    }
    for (const action of ['disconnect', 'enable', 'disable', 'tool-toggle'] as const) {
      const rendered = describeMcpActionFailure(action, error, t);
      for (const secret of [token, 'Authorization=', 'Bearer_', 'PRIVATE_FRAGMENT', url])
        expect(rendered).not.toContain(secret);
    }
  }
  expect(
    describeConnectionFailure(
      { ...failure('http-status'), httpStatus: token as unknown as number },
      t,
    ),
  ).toBe('Server returned an HTTP error (during initialization)');
});

it.each([
  ['duplicate-name', 'A server with this name already exists'],
  ['connection-changed', 'The connection changed during authorization; try again'],
  [undefined, 'Could not write the server settings'],
  ['future-reason', 'Could not write the server settings'],
])('distinguishes conflict reason %s without matching messages', (reason, expected) => {
  expect(
    describeSaveFailure(
      'persistence',
      new DataApiError(ErrorCode.CONFLICT, 'duplicate name', { reason }),
      t,
    ),
  ).toBe(`Saving settings failed: ${expected}`);
});

it('reads the shared carrier before a stale convenience property', () => {
  const error = Object.defineProperty(new Error('private'), 'connectionFailure', {
    value: failure('unknown'),
    configurable: false,
  });
  attachMcpFailureFacts(error, failure('timeout'));
  expect(describeSaveFailure('connection', error, t)).toContain('Connection timed out');
});

it('retains the property fallback for older callers', () => {
  const error = { connectionFailure: failure('catalog-integrity', 'tools-list') };
  expect(describeSaveFailure('connection', error, t)).toBe(
    `Connection check failed: ${kinds['catalog-integrity']} (during tool listing)`,
  );
});

it('uses discovery wording even when a tools-list protocol code is present', () => {
  expect(
    describeConnectionFailure(
      { ...failure('protocol-handshake', 'tools-list'), protocolCode: -32600 },
      t,
    ),
  ).toBe('Server returned an invalid tool listing (during tool listing)');
});

it.each([
  ['private primitive', 'Connection failed'],
  [new Error('private'), 'Connection failed'],
  [new McpAuthorizationError('reauthorize'), en['settings.mcp.oauth.errors.reauthorize']],
  [new McpAuthorizationError('cancelled'), 'Authorization failed'],
  [new McpRedirectError('https://private.example/SECRET_TOKEN_1730'), kinds.redirect],
  [thrown(failure()), 'Connection timed out (during initialization)'],
] as const)(
  'preserves the cause wording after an OAuth probe rejection: %p',
  async (error, reason) => {
    const result = await runMcpSaveWorkflow({
      validate: () => ({ ok: true }),
      probe: async () => {},
      persist: async (operation) => {
        await runMcpConnectionProbe(Promise.reject(error), operation);
      },
      grantCleanup: async () => {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(error);
    expect(describeSaveFailure(result.step, result.error, t)).toBe(
      `Connection check failed: ${reason}`,
    );
    expect(describeSaveFailure(result.step, result.error, t)).toBe(
      describeSaveFailure('connection', error, t),
    );
  },
);
