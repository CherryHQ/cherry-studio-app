import { projectMessage } from '../remoteAgentViews';

const issueResource = () => 'opaque-resource';
const message = {
  messageId: 'm',
  revision: '1',
  role: 'assistant' as const,
  status: 'success' as const,
  partIds: ['input', 'output', 'answer'],
};
it('distinguishes completed tool arguments from a completed invocation and keeps tool failure local to the part', () => {
  const input = {
    partId: 'input',
    revision: '1',
    kind: 'tool-input' as const,
    toolName: 'read',
    toolCallId: 'call',
    content: { text: '{}' },
    state: 'completed' as const,
  };
  expect(projectMessage('s', message, [input], issueResource).parts[0]).toMatchObject({
    kind: 'tool',
    state: 'input-ready',
  });
  const projected = projectMessage(
    's',
    message,
    [
      input,
      {
        ...input,
        partId: 'output',
        kind: 'tool-output',
        state: 'failed',
        content: { text: 'missing file' },
      },
      {
        partId: 'answer',
        revision: '1',
        kind: 'text',
        content: { text: 'The file was not found.' },
        state: 'completed',
      },
    ],
    issueResource,
  );
  expect(projected.parts[0]).toMatchObject({
    kind: 'tool',
    state: 'failed',
    input: expect.any(String),
    output: expect.any(String),
  });
  expect(projected.state).toBe('success');
});
it('exposes desktop data-file parts as metadata without claiming downloadable bytes', () => {
  const projected = projectMessage(
    's',
    message,
    [
      {
        partId: 'file',
        revision: '1',
        kind: 'data',
        name: 'file',
        content: { text: JSON.stringify({ filename: 'report.pdf', mediaType: 'application/pdf' }) },
      },
    ],
    issueResource,
  );
  expect(projected.parts[0]).toMatchObject({
    kind: 'file',
    name: 'report.pdf',
    mediaType: 'application/pdf',
  });
  expect(projected.parts[0]).not.toHaveProperty('url');
});
