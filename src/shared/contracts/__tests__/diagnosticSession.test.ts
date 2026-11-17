import { DiagnosticAiContextSchema, DiagnosticToolResultSchema } from '../diagnosticSession';

const configuration = {
  provider: 'provider',
  model: 'model',
  endpointHost: 'provider.example',
  configurationIssue: null,
  remoteExecution: false,
};

test('each diagnostic tool result has one closed data shape selected by its tool identity', () => {
  const results = [
    { tool: 'configuration', data: configuration },
    { tool: 'endpoint', data: { id: 'endpoint', status: 'pass', facts: { httpStatus: 401 } } },
    {
      tool: 'plugins',
      data: {
        enabledCount: 1,
        connectedCount: 1,
        truncated: false,
        connections: [{ state: 'connected' }],
      },
    },
    {
      tool: 'logs',
      data: [
        {
          schemaVersion: 1,
          capture: 'metadata',
          timestamp: '2026-11-06T00:00:00Z',
          level: 'error',
          module: 'Module',
          message: 'Application error',
          facts: { statusCode: 401, providerId: 'provider' },
        },
      ],
    },
  ];
  for (const result of results) expect(DiagnosticToolResultSchema.parse(result)).toEqual(result);
  for (const unsafe of [
    { tool: 'configuration', data: { ...configuration, apiKey: 'sk-private' } },
    { tool: 'configuration', data: { ...configuration, provider: 'https://private.example' } },
    { tool: 'endpoint', data: { id: 'model', status: 'pass' } },
    { tool: 'endpoint', data: { id: 'endpoint', status: 'pass', responseBody: 'private' } },
    {
      tool: 'plugins',
      data: {
        enabledCount: 1,
        connectedCount: 0,
        truncated: false,
        connections: [{ state: 'error', endpoint: 'https://private.example' }],
      },
    },
    {
      tool: 'logs',
      data: Array.from({ length: 13 }, () => ({
        schemaVersion: 1,
        capture: 'metadata',
        timestamp: '2026-11-06T00:00:00Z',
        level: 'error',
        module: 'Module',
        message: 'Application error',
        facts: {},
      })),
    },
  ])
    expect(DiagnosticToolResultSchema.safeParse(unsafe).success).toBe(false);
});

test('the initial AI context excludes raw failures, credentials and unrelated application data', () => {
  const context = { configuration, checks: [], incident: { reason: 'auth', statusCode: 401 } };
  expect(DiagnosticAiContextSchema.parse(context)).toEqual(context);
  for (const unsafe of [
    { ...context, history: ['private conversation'] },
    { ...context, incident: { ...context.incident, responseBody: 'private' } },
    { ...context, configuration: { ...configuration, headers: { Authorization: 'private' } } },
  ])
    expect(DiagnosticAiContextSchema.safeParse(unsafe).success).toBe(false);
});
