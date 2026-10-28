import {
  isVertexAuthConfigured,
  parseVertexAuthEdit,
  vertexAuthFieldValue,
} from '../utils/providerVertexAuth';

const privateKey = '-----BEGIN PRIVATE KEY-----\nYWJjZA==\n-----END PRIVATE KEY-----';
const config = { type: 'iam-gcp' as const, project: '', location: '' };
const keyFile = {
  type: 'service_account',
  project_id: 'my-project',
  client_email: 'svc@example.com',
  private_key: privateKey,
  token_uri: 'https://untrusted.example/token',
};

it('imports only the account fields, defaults the region, and never takes a token URL from JSON', () => {
  const parsed = parseVertexAuthEdit(config, 'json', JSON.stringify(keyFile));
  expect(parsed.config).toEqual({
    type: 'iam-gcp',
    project: 'my-project',
    location: 'global',
    credentials: { clientEmail: 'svc@example.com', privateKey },
  });
  expect(isVertexAuthConfigured(parsed.config!)).toBe(true);
  expect(config).toEqual({ type: 'iam-gcp', project: '', location: '' });
});

it.each([
  'not json',
  'null',
  '[]',
  JSON.stringify({ ...keyFile, private_key: 3 }),
  JSON.stringify({ ...keyFile, type: 'authorized_user' }),
])('rejects invalid input atomically: %s', (text) => {
  expect(parseVertexAuthEdit(config, 'json', text)).toEqual({
    error: 'settings.provider.vertex.invalidJson',
  });
});

it('preserves an explicit region and recognizes previously stored snake-case credentials', () => {
  expect(
    parseVertexAuthEdit({ ...config, location: 'us-east5' }, 'json', JSON.stringify(keyFile)).config
      ?.location,
  ).toBe('us-east5');
  const saved = {
    ...config,
    project: 'my-project',
    location: 'global',
    credentials: { private_key: privateKey, client_email: 'svc@example.com' },
  };
  expect(vertexAuthFieldValue(saved, 'privateKey')).toBe(privateKey);
  expect(isVertexAuthConfigured(saved)).toBe(true);
  expect(isVertexAuthConfigured({ ...saved, credentials: { private_key: privateKey } })).toBe(
    false,
  );
});
