import type { SshTarget } from '@/shared/data/types/ssh';

import { createSshTool, type SshToolAccess } from '../sshTool';

const target: SshTarget = {
  selectionId: 'selection',
  profile: {
    id: 'connection',
    revision: 'revision',
    name: 'Router',
    host: 'router.local',
    port: 22,
    username: 'admin',
    authMethod: 'password',
    fingerprint: 'SHA256:key',
  },
  grant: null,
};
const ssh: SshToolAccess = {
  isAvailable: () => true,
  resolveAgentTarget: async () => target,
  executeForAgent: jest.fn(
    async () =>
      ({
        state: 'unknown',
        stdout: 'x'.repeat(20000),
        stderr: '',
        exitCode: null,
        truncated: false,
      }) as const,
  ),
};
const call = (input: Record<string, string>) => ({
  input,
  signal: new AbortController().signal,
  toolCallId: 'call',
  turnId: 'turn',
});
const input = {
  connection_id: 'connection',
  connection_revision: 'revision',
  target: 'admin@router.local:22',
  command: 'uname -a',
};

beforeEach(() => {
  jest.clearAllMocks();
});

test('requires explicit approval by default even under global automatic approval', () => {
  const tool = createSshTool(ssh, 'conversation', target);
  expect(tool.approval).toBe('ask');
  expect(tool.autoApprovalEligible).toBe(false);
  expect(
    createSshTool(ssh, 'conversation', { ...target, grant: { id: 'grant', expiresAt: 123 } })
      .approval,
  ).toBe('auto');
});

test('cannot substitute a target or a revision after approval', async () => {
  const tool = createSshTool(ssh, 'conversation', target);
  await expect(tool.execute(call({ ...input, connection_revision: 'another' }))).rejects.toThrow();
  await expect(tool.execute(call({ ...input, target: 'root@other.local:22' }))).rejects.toThrow();
  expect(ssh.executeForAgent).not.toHaveBeenCalled();
});

test('keeps unknown remote outcomes and bounds model output', async () => {
  const result = await createSshTool(ssh, 'conversation', target).execute(call(input));
  expect(result.value).toMatchObject({
    state: 'unknown',
    exitCode: null,
    truncated: true,
    stdout: 'x'.repeat(16000),
  });
  expect(ssh.executeForAgent).toHaveBeenCalledTimes(1);
});
