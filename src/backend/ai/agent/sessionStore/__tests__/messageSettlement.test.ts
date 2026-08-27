import { interruptNonTerminalToolParts } from '../messageSettlement';

const TOOL_REF = { source: 'mcp', serverId: 'server-1', rawToolName: 'delete_file' } as const;

describe('message settlement', () => {
  test.each(['input-available', 'awaiting-approval', 'running'] as const)(
    'terminalizes %s tool state with no pending approval',
    (state) => {
      const [part] = interruptNonTerminalToolParts(
        [
          {
            id: 'tool-call-1',
            type: 'tool',
            toolCallId: 'call-1',
            toolRef: TOOL_REF,
            providerName: 'mcp_server_1_delete_file_a1b2',
            displayName: 'Delete file',
            state,
            input: { fileEntryId: 'file-1' },
            ...(state === 'awaiting-approval' ? { approvalId: 'approval-1' } : {}),
          },
        ],
        'The app restarted.',
      );

      expect(part).toMatchObject({
        state: 'interrupted',
        output: {
          value: { status: 'interrupted', reason: 'The app restarted.' },
          artifacts: [],
        },
      });
      expect(part).not.toHaveProperty('approvalId');
    },
  );
});
