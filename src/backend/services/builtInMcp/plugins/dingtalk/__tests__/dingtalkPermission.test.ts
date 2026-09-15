import {
  dingtalkPermissionChallenge,
  readDingtalkPermission,
  readDingtalkResponsePermission,
} from '../dingtalkPermission';

const permission = {
  success: false,
  code: 'AGENT_CODE_NOT_EXISTS',
  data: {
    clientId: 'app',
    clientSecret: 'private-secret',
    flowId: 'flow',
    uri: 'https://open-dev.dingtalk.com/fe/old#%2FpersonalAuthorization?flowId=flow&userCode=code',
    ignoredField: 'private-diagnostic',
  },
};

it.each([
  permission,
  { structuredContent: permission },
  { content: [{ type: 'text', text: JSON.stringify(permission) }] },
  { jsonrpc: '2.0', id: 1, error: { code: -32000, data: permission } },
])('detects private challenges across official response envelopes', (value) => {
  const parsed = readDingtalkPermission(value);
  expect(parsed).toMatchObject({
    code: 'AGENT_CODE_NOT_EXISTS',
    clientSecret: 'private-secret',
    flowId: 'flow',
  });
  expect(JSON.stringify(parsed)).not.toContain('private-diagnostic');
});

it('normalizes the legacy hash route and binds the URL to its flow ID', () => {
  const parsed = readDingtalkPermission(permission)!;
  const challenge = dingtalkPermissionChallenge(parsed);
  const url = new URL(challenge.verificationUrl);
  expect(url.searchParams.get('hash')).toBe('#/personalAuthorization?flowId=flow&userCode=code');
  expect(challenge.flowId).toBe('flow');
  expect(() => dingtalkPermissionChallenge({ ...parsed, flowId: 'other' })).toThrow();
  expect(() =>
    dingtalkPermissionChallenge({ ...parsed, uri: 'https://evil.test/authorize' }),
  ).toThrow();
});

it('strips malformed challenges instead of forwarding their secrets', () => {
  expect(() =>
    readDingtalkPermission({
      ...permission,
      data: { ...permission.data, clientId: 'bad\nidentifier' },
    }),
  ).toThrow('Dingtalk requires authorization.');
  expect(
    readDingtalkPermission({ content: [{ type: 'text', text: 'Ordinary document text.' }] }),
  ).toBeUndefined();
});

it('inspects HTTP error bodies without consuming the SDK response', async () => {
  const body = JSON.stringify(permission);
  const response = new Response(body, {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
  expect(await readDingtalkResponsePermission(response)).toMatchObject({
    code: 'AGENT_CODE_NOT_EXISTS',
  });
  expect(await response.text()).toBe(body);
});

it('leaves event streams to the SDK instead of waiting for them to close', async () => {
  const response = new Response('data: pending\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
  expect(await readDingtalkResponsePermission(response)).toBeUndefined();
  expect(response.bodyUsed).toBe(false);
});
