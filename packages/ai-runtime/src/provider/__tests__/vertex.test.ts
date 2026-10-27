import { describe, expect, it } from 'vitest';

import { normalizeVertexCredentials, resolveVertexUrls } from '../vertex';

describe('Vertex connection facts', () => {
  it('normalizes either persisted credential shape without accepting non-string secrets', () => {
    expect(
      normalizeVertexCredentials({ client_email: ' svc@example.com ', private_key: ' key ' }),
    ).toEqual({ clientEmail: 'svc@example.com', privateKey: 'key' });
    expect(normalizeVertexCredentials({ clientEmail: {}, privateKey: 12 })).toEqual({});
  });

  it.each([
    ['', 'global', 'https://aiplatform.googleapis.com'],
    ['', 'us', 'https://aiplatform.us.rep.googleapis.com'],
    ['', 'eu', 'https://aiplatform.eu.rep.googleapis.com'],
    ['', 'us-central1', 'https://us-central1-aiplatform.googleapis.com'],
    ['https://us-east5-aiplatform.googleapis.com', 'global', 'https://aiplatform.googleapis.com'],
    ['https://aiplatform.googleapis.com', 'us', 'https://aiplatform.us.rep.googleapis.com'],
    ['https://aiplatform.us.rep.googleapis.com', 'eu', 'https://aiplatform.eu.rep.googleapis.com'],
    ['https://aiplatform.eu.rep.googleapis.com', 'global', 'https://aiplatform.googleapis.com'],
    ['https://gateway.example/vertex/v1', 'global', 'https://gateway.example/vertex'],
    ['https://gateway.example/vertex/v1', 'eu', 'https://gateway.example/vertex'],
    [
      'https://gateway.example/vertex/v1/projects/project-id/locations/global',
      'global',
      'https://gateway.example/vertex',
    ],
    ['https://evilaiplatform.googleapis.com', 'global', 'https://evilaiplatform.googleapis.com'],
    [
      'https://aiplatform.eu.rep.googleapis.com.gateway.example',
      'eu',
      'https://aiplatform.eu.rep.googleapis.com.gateway.example',
    ],
  ])(
    'resolves %s at %s without losing or duplicating the project path',
    (baseUrl, location, serviceUrl) => {
      expect(resolveVertexUrls(baseUrl, 'project-id', location)).toEqual({
        serviceUrl,
        resourceUrl: `${serviceUrl}/v1/projects/project-id/locations/${location}`,
      });
    },
  );

  it.each([
    'https://gateway.example/v1/projects/other/locations/global',
    'https://gateway.example/v1/projects/project-id/locations/global/publishers/google/models/gemini:streamGenerateContent',
    'https://user:secret@gateway.example',
    'https://gateway.example?key=secret',
    'file:///tmp/key',
  ])('rejects ambiguous or credential-bearing overrides: %s', (baseUrl) => {
    expect(() => resolveVertexUrls(baseUrl, 'project-id', 'global')).toThrow();
  });

  it('preserves an explicit beta version and the existing no-version marker', () => {
    expect(
      resolveVertexUrls('https://gateway.example/v1beta1', 'project-id', 'global').resourceUrl,
    ).toBe('https://gateway.example/v1beta1/projects/project-id/locations/global');
    expect(
      resolveVertexUrls('https://gateway.example/vertex#', 'project-id', 'global').resourceUrl,
    ).toBe('https://gateway.example/vertex/projects/project-id/locations/global');
  });
});
