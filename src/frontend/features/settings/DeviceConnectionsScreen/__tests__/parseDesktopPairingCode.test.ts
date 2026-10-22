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
