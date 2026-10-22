import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseDesktopPairingCode } from '../parseDesktopPairingCode';

const invitation = {
  t: 'cherry-studio-pair',
  v: 2,
  name: 'Desktop',
  desktopIdentity: 'desktop',
  invitationId: 'invitation',
  invitationSecret: 'secret',
  ips: ['192.168.1.2', '::1'],
  port: 23333,
  protocolVersions: [1],
};

test('accepts complete desktop QR content with pasted whitespace', () => {
  expect(parseDesktopPairingCode(`\n ${JSON.stringify(invitation)} \n`)).toEqual(invitation);
});

test.each(['', '123456', 'not-json', 'null', '[]'])('rejects non-invitation input: %s', (value) => {
  expect(parseDesktopPairingCode(value)).toBeUndefined();
});

test.each([
  { invitationSecret: undefined },
  { v: 1 },
  { t: 'other' },
  { ips: ['not-an-address'] },
  { port: 70000 },
])('rejects incomplete or unsupported invitations', (changes) => {
  expect(parseDesktopPairingCode(JSON.stringify({ ...invitation, ...changes }))).toBeUndefined();
});

const fixtures: { name: string; input: unknown; valid: boolean }[] = JSON.parse(
  readFileSync(
    join(dirname(require.resolve('@cherrystudio/remote-protocol')), '../fixtures/pairing-qr.json'),
    'utf8',
  ),
);

test.each(fixtures)('consumes the published QR fixture: $name', ({ input, valid }) => {
  const result = parseDesktopPairingCode(`\n ${JSON.stringify(input)} \n`);
  if (valid) expect(result).toEqual(input);
  else expect(result).toBeUndefined();
});

test('preserves ordered custom endpoints and strips injected local pairing state', () => {
  const { ips: _ips, port: _port, ...proof } = invitation;
  const input = {
    ...proof,
    v: 3,
    endpoints: [
      { host: 'desktop.example.com', port: 24443, security: 'wss' },
      { host: '100.64.0.2', port: 23333, security: 'ws' },
      { host: 'fd7a::2', port: 24444, security: 'ws' },
    ],
  };
  expect(
    parseDesktopPairingCode(
      JSON.stringify({
        ...input,
        connectionId: 'f676e1d5-24c6-4150-a3fa-0f4427964465',
        capabilities: ['agent'],
      }),
    ),
  ).toEqual(input);
});

test.each([
  { host: 'desktop.example.com', port: 0, security: 'wss' },
  { host: 'desktop.example.com', port: 65536, security: 'wss' },
  { host: 'desktop.example.com', port: 443.5, security: 'wss' },
  { host: 'desktop.example.com', port: 443, security: 'https' },
  { host: 'desktop.example.com/path', port: 443, security: 'wss' },
  { host: 'desktop.example.com?query', port: 443, security: 'wss' },
])('rejects invalid v3 endpoints before pairing: %j', (endpoint) => {
  expect(
    parseDesktopPairingCode(
      JSON.stringify({
        ...invitation,
        v: 3,
        endpoints: [endpoint],
      }),
    ),
  ).toBeUndefined();
});
