import { Button } from 'heroui-native/button';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PendingToolApproval } from '../../runtime/chatRuntimeMessages';
import { McpApprovalSheet } from '../McpApprovalSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/bottomSheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    BottomSheet: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
  };
});

jest.mock('heroui-native/button', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');

  function MockButton({ children, ...props }: { children?: ReactNode }) {
    return <MockView {...props}>{children}</MockView>;
  }
  MockButton.Label = MockText;

  return { Button: MockButton };
});

const alwaysAllowLabel = 'chat.mcpTool.approval.alwaysAllow';

function makeApproval(overrides: Partial<PendingToolApproval> = {}): PendingToolApproval {
  return {
    approvalId: 'approval-1',
    input: { query: 'cherry' },
    mcpSource: { rawToolName: 'search_docs', serverId: 'server-1' },
    messageId: 'assistant-1',
    toolCallId: 'call-1',
    toolName: 'mcp__serverOne__searchDocs',
    ...overrides,
  };
}

describe('McpApprovalSheet', () => {
  let renderer: ReactTestRenderer;

  afterEach(async () => {
    await act(() => renderer.unmount());
  });

  function render(
    overrides: {
      approvals?: readonly PendingToolApproval[];
      onAlwaysAllow?: () => Promise<void>;
    } = {},
  ) {
    const onAlwaysAllow = jest.fn(overrides.onAlwaysAllow ?? (async () => undefined));
    const onRespond = jest.fn(async () => undefined);

    act(() => {
      renderer = create(
        <McpApprovalSheet
          approvals={overrides.approvals ?? [makeApproval()]}
          isOpen
          onAlwaysAllow={onAlwaysAllow}
          onClose={jest.fn()}
          onRespond={onRespond}
        />,
      );
    });

    return { onAlwaysAllow, onRespond };
  }

  function findButton(label: string) {
    return renderer.root
      .findAllByType(Button)
      .find((node) => node.findAllByType(Button.Label)[0]?.props.children === label);
  }

  async function press(label: string) {
    const button = findButton(label);
    if (!button) {
      throw new Error(`no button labelled ${label}`);
    }

    await act(async () => button.props.onPress());
  }

  test('waits for the auto-approve rule to be saved before approving the call', async () => {
    let saveRule!: () => void;
    const ruleSaved = new Promise<void>((resolve) => {
      saveRule = resolve;
    });
    const { onAlwaysAllow, onRespond } = render({ onAlwaysAllow: () => ruleSaved });
    const button = findButton(alwaysAllowLabel);

    await act(async () => {
      button?.props.onPress();
      await Promise.resolve();

      // Not merely called first — awaited. The resume starts the moment the
      // decision lands, and the next call in the same turn re-reads the rule,
      // so a rule still being written would lose the race.
      expect(onAlwaysAllow).toHaveBeenCalledWith({
        rawToolName: 'search_docs',
        serverId: 'server-1',
      });
      expect(onRespond).not.toHaveBeenCalled();

      saveRule();
    });

    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
    });
  });

  test('approves the call even when the rule could not be saved', async () => {
    const { onRespond } = render({
      onAlwaysAllow: async () => {
        throw new Error('write failed');
      },
    });

    await press(alwaysAllowLabel);

    // Losing the preference must not also lose the decision — the call the user
    // approved would otherwise sit unanswered until the turn is torn down.
    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
    });
  });

  test('offers no always-allow shortcut for a tool with no MCP rule behind it', () => {
    render({ approvals: [makeApproval({ mcpSource: undefined })] });

    expect(findButton(alwaysAllowLabel)).toBeUndefined();
    expect(findButton('chat.mcpTool.approval.allow')).toBeDefined();
  });
});
