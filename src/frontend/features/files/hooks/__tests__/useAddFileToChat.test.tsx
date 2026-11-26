import { act, create } from 'react-test-renderer';

import { takeChatSelectionHandoff, type ChatTarget } from '@/frontend/appShell/navigation/chat';
import type { FilePreviewOrigin } from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useAddFileToChat } from '../useAddFileToChat';

const mockUseAgentSession = jest.fn();
const mockUseAgentApiById = jest.fn();
const mockReturnToChat = jest.fn();

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (id: string | undefined) => mockUseAgentApiById(id),
  useAgentSession: (id: string | undefined) => mockUseAgentSession(id),
}));
jest.mock('../useReturnToChat', () => ({
  useReturnToChat: () => mockReturnToChat,
}));

const agents = {
  'agent-minimal': { id: 'agent-minimal', mode: 'minimal' },
  'agent-standard': { id: 'agent-standard', mode: 'standard' },
} as const;

const file: ResolvedFile = {
  entry: FileEntrySchema.parse({
    createdAt: 1,
    filename: 'report.md',
    id: '00000000-0000-7000-8000-000000000001',
    mediaType: 'text/markdown',
    provenance: 'generated',
    size: 42,
    updatedAt: 2,
  }),
  uri: 'file:///managed/report.md',
};

describe('useAddFileToChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAgentSession.mockImplementation((id?: string) => ({
      data: id
        ? { agentId: id === 'session-minimal' ? 'agent-minimal' : 'agent-standard' }
        : undefined,
      isLoading: false,
    }));
    mockUseAgentApiById.mockImplementation((id?: keyof typeof agents) => ({
      agent: id ? agents[id] : undefined,
      isLoading: false,
    }));
  });

  it('forbids adding a file that originated from the same chat while keeping Office reference eligibility', () => {
    const result = read(file, { kind: 'session', sessionId: 'session-standard' }, 'chat');

    expect(result.returnsToSourceChat).toBe(true);
    expect(result.canAddToChat).toBe(false);

    act(() => result.add());
    expect(mockReturnToChat).not.toHaveBeenCalled();
  });

  it('hands off the whole file without sending when opened from an external surface with an eligible chat', () => {
    const result = read(file, { kind: 'session', sessionId: 'session-standard' }, 'external');

    expect(result.isResolving).toBe(false);
    expect(result.returnsToSourceChat).toBe(true);
    expect(result.canAddToChat).toBe(true);

    act(() => result.add());
    expect(mockReturnToChat).toHaveBeenCalledTimes(1);
    const target = mockReturnToChat.mock.calls[0][0] as ChatTarget;
    expect(target).toMatchObject({
      kind: 'session',
      sessionId: 'session-standard',
      selectionHandoff: expect.any(String),
    });
    const handoff = takeChatSelectionHandoff(target.selectionHandoff);
    expect(handoff).toEqual({
      attachment: {
        fileEntryId: file.entry.id,
        id: `file-entry:${file.entry.id}`,
        kind: 'file',
        mediaType: 'text/markdown',
        name: 'report.md',
        size: 42,
        status: 'ready',
        uri: file.uri,
      },
    });
    expect(handoff?.selection).toBeUndefined();
  });

  it('keeps Add visible as a placeholder while resolving but prevents handoff until ready', () => {
    mockUseAgentSession.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAgentApiById.mockReturnValue({ agent: undefined, isLoading: false });

    const result = read(file, { kind: 'session', sessionId: 'session-standard' }, 'external');

    expect(result.isResolving).toBe(true);
    expect(result.canAddToChat).toBe(true);

    act(() => result.add());
    expect(mockReturnToChat).not.toHaveBeenCalled();
  });

  it('disallows adding when the Agent is minimal, missing, or no file or chat exists', () => {
    for (const [targetFile, targetChat] of [
      [file, { kind: 'session', sessionId: 'session-minimal' }],
      [file, { kind: 'draft', agentId: 'agent-minimal' }],
      [file, { kind: 'draft', agentId: 'agent-deleted' }],
      [file, undefined],
      [undefined, { kind: 'session', sessionId: 'session-standard' }],
    ] as const) {
      const result = read(targetFile, targetChat, 'external');
      expect(result.canAddToChat).toBe(false);
      act(() => result.add());
    }

    expect(mockReturnToChat).not.toHaveBeenCalled();
  });
});

function read(
  targetFile: ResolvedFile | undefined,
  sourceChat: ChatTarget | undefined,
  sourceOrigin?: FilePreviewOrigin,
) {
  let result: ReturnType<typeof useAddFileToChat> | undefined;
  function Probe() {
    result = useAddFileToChat(targetFile, sourceChat, sourceOrigin);
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  if (!result) throw new Error('Hook did not render');
  return result;
}
