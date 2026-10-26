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

test('accepts v3 pairing codes with a secure domain and a custom port', () => {
  const code = {
    t: invitation.t,
    name: invitation.name,
    desktopIdentity: invitation.desktopIdentity,
    invitationId: invitation.invitationId,
    invitationSecret: invitation.invitationSecret,
    protocolVersions: invitation.protocolVersions,
    v: 3,
    endpoints: [{ host: 'desktop.example.com', port: 24444, security: 'wss' }],
  };
  expect(parseDesktopPairingCode(JSON.stringify(code))).toEqual(code);
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
