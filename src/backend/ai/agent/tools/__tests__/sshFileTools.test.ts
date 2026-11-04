import { FileEntrySchema } from '@/shared/data/types/file';
import { SshDownloadError, type SshTarget } from '@/shared/data/types/ssh';

import { createSshFileTools } from '../sshFileTools';
import type { SshToolAccess } from '../sshTool';
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const fileId = '11111111-1111-4111-8111-111111111111';
const profile = {
  id: 'connection',
  revision: 'revision',
  name: 'Server',
  host: 'server.example',
  port: 22,
  username: 'user',
  authMethod: 'password' as const,
  fingerprint: 'SHA256:key',
  isEnabled: true,
  remoteDirectory: '/srv/project',
};
const target: SshTarget = {
  profile,
  selectionId: 'selection',
  grant: { id: 'grant', expiresAt: Date.now() + 3600000 },
};
const ssh: jest.Mocked<SshToolAccess> = {
  isAvailable: jest.fn(),
  resolveAgentTarget: jest.fn(),
  executeForAgent: jest.fn(),
  filesForAgent: jest.fn(),
  uploadForAgent: jest.fn(),
  downloadForAgent: jest.fn(),
};
const input = {
  target: 'user@server.example:22',
  path: 'notes.txt',
};
const call = (value: Record<string, string | boolean>) => ({
  input: value,
  signal: new AbortController().signal,
  toolCallId: 'call',
  turnId: 'turn',
});
const access = () =>
  new WorkspaceFileAccess(null, {
    availableFiles: new Map(),
    draftFileEntryIds: new Set(),
    fileEntryIds: new Set(),
    grantFile: () => undefined,
  });
const tool = (name: string) =>
  createSshFileTools(ssh, 'conversation', target, access()).find(
    (item) => item.providerName === name,
  )!;

beforeEach(() => {
  jest.resetAllMocks();
});

test('keeps file approval independent from the shell grant and binds every request to its target', async () => {
  for (const item of createSshFileTools(ssh, 'conversation', target, access()))
    expect(item).toMatchObject({ approval: 'ask', autoApprovalEligible: false });
  expect(
    (await tool('ssh_read_file').execute(call({ ...input, connection_revision: 'changed' }))).value,
  ).toMatchObject({ error: 'invalid-input' });
  expect(ssh.filesForAgent).not.toHaveBeenCalled();
});

test('refuses to upload a managed file that was not granted to the conversation', async () => {
  await expect(
    tool('ssh_upload_file').execute(call({ ...input, file_entry_id: fileId, overwrite: false })),
  ).rejects.toThrow();
  expect(ssh.uploadForAgent).not.toHaveBeenCalled();
});

test('publishes downloaded files as managed artifacts without exposing a device path', async () => {
  const entry = FileEntrySchema.parse({
    id: fileId,
    filename: 'notes.txt',
    size: 5,
    mediaType: 'text/plain',
    provenance: 'imported',
    createdAt: 1,
    updatedAt: 1,
  });
  ssh.downloadForAgent.mockResolvedValue({ entry, uri: 'file:///private/device-path/notes.txt' });
  const result = await tool('ssh_download_file').execute(call(input));
  expect(result.artifacts).toEqual([
    {
      ref: { kind: 'managed-file', fileEntryId: fileId },
      mediaType: 'text/plain',
      name: 'notes.txt',
      kind: 'created',
    },
  ]);
  expect(JSON.stringify(result)).not.toContain('device-path');
  expect(ssh.downloadForAgent).toHaveBeenCalledWith(
    'conversation',
    target,
    'notes.txt',
    null,
    expect.any(AbortSignal),
  );
});

test('preserves an uncertain write outcome and does not replay it', async () => {
  ssh.filesForAgent.mockResolvedValue({
    state: 'unknown',
    path: '/srv/project/notes.txt',
    content: '',
    entries: [],
    bytes: 5,
    truncated: false,
    error: 'connection',
  });
  const result = await tool('ssh_write_file').execute(
    call({ ...input, content: 'hello', overwrite: true }),
  );
  expect(result.value).toMatchObject({ state: 'unknown', error: 'connection' });
  expect(ssh.filesForAgent).toHaveBeenCalledTimes(1);
});

test.each(['not-started', 'unknown'] as const)(
  'preserves a %s download failure without publishing an artifact or retrying',
  async (state) => {
    ssh.downloadForAgent.mockRejectedValue(new SshDownloadError('connection', state));
    const result = await tool('ssh_download_file').execute(call(input));
    expect(result.value).toMatchObject({ state, error: 'connection' });
    expect(result.artifacts).toEqual([]);
    expect(ssh.downloadForAgent).toHaveBeenCalledTimes(1);
  },
);
