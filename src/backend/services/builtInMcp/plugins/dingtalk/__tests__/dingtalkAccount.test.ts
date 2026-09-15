import { createOfficialMcpClient } from '../../../transport/createOfficialMcpClient';
import { enrichDingtalkAccount } from '../dingtalkAccount';
import type { DingtalkUserCredential } from '../dingtalkCredentials';

jest.mock('../../../transport/createOfficialMcpClient');
const createRemote = jest.mocked(createOfficialMcpClient);
const credential: DingtalkUserCredential = {
  version: 1,
  clientId: 'client',
  account: { corpId: 'org-1' },
  tokens: {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: 3601000,
    refreshExpiresAt: 86401000,
  },
};
const signal = new AbortController().signal;
const remote = {
  serverInfo: { name: 'Official', version: '1' },
  listTools: jest.fn(async () => ({ tools: [] })),
  callTool: jest.fn(async () => ({ content: [{ type: 'text' as const, text: '{}' }] })),
  close: jest.fn(async () => {}),
};
beforeEach(() => {
  jest.resetAllMocks();
  remote.close.mockResolvedValue(undefined);
  createRemote.mockResolvedValue(remote);
});

it('uses only the matching organization when the contact profile contains multiple employers', async () => {
  remote.callTool.mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          result: [
            { orgEmployeeModel: { corpId: 'other-org', userId: 'other-user' } },
            {
              orgEmployeeModel: {
                corpId: 'org-1',
                orgName: 'Cherry',
                userId: 'user-1',
                orgUserName: 'Sam',
              },
            },
          ],
        }),
      },
    ],
  });
  expect(await enrichDingtalkAccount(credential, signal)).toMatchObject({
    account: { corpId: 'org-1', userId: 'user-1', userName: 'Sam', corpName: 'Cherry' },
  });
  expect(remote.close).toHaveBeenCalledTimes(1);
});

it.each([
  { result: [{ orgEmployeeModel: { corpId: 'other-org', userId: 'other-user' } }] },
  {
    result: [
      { orgEmployeeModel: { userId: 'first-user' } },
      { orgEmployeeModel: { userId: 'second-user' } },
    ],
  },
])(
  'does not infer employee identity from mismatched or ambiguous contact records',
  async ({ result }) => {
    remote.callTool.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ result }) }],
    });
    expect(await enrichDingtalkAccount(credential, signal)).toEqual(credential);
  },
);

it('keeps organization-only authorization valid when contact access is unavailable', async () => {
  remote.callTool.mockRejectedValue(new Error('private upstream response'));
  expect(await enrichDingtalkAccount(credential, signal)).toEqual(credential);
  expect(remote.close).toHaveBeenCalledTimes(1);
});
