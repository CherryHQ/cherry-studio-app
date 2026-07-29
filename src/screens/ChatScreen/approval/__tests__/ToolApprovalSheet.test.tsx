import { Button } from 'heroui-native/button';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '@/components/bottomSheet';
import type { PendingToolApproval } from '../../runtime/chatRuntimeMessages';
import { ToolApprovalSheet } from '../ToolApprovalSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolation values are half of what this sheet gets right or wrong — a
    // pending count rendered without its count would read as passing.
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@/components/bottomSheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    BottomSheet: ({ children, ...props }: { children: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
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

const allowLabel = 'chat.tool.approval.allow';
const denyLabel = 'chat.tool.approval.deny';

function makeApproval(overrides: Partial<PendingToolApproval> = {}): PendingToolApproval {
  return {
    approvalId: 'approval-1',
    input: { query: 'cherry' },
    messageId: 'assistant-1',
    toolCallId: 'call-1',
    toolName: 'mcp__serverOne__searchDocs',
    ...overrides,
  };
}

describe('ToolApprovalSheet', () => {
  let renderer: ReactTestRenderer;

  afterEach(async () => {
    await act(() => renderer.unmount());
  });

  function render(
    overrides: { approvals?: readonly PendingToolApproval[]; onRespond?: () => Promise<void> } = {},
  ) {
    const onRespond = jest.fn(overrides.onRespond ?? (async () => undefined));
    const element = (approvals: readonly PendingToolApproval[]) => (
      <ToolApprovalSheet approvals={approvals} isOpen onRespond={onRespond} />
    );

    act(() => {
      renderer = create(element(overrides.approvals ?? [makeApproval()]));
    });

    return {
      onRespond,
      rerender: (approvals: readonly PendingToolApproval[]) =>
        act(() => {
          renderer.update(element(approvals));
        }),
    };
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

  function renderedTexts(): string[] {
    return renderer.root
      .findAllByType(Text)
      .map((node) => node.props.children)
      .filter((child): child is string => typeof child === 'string');
  }

  test('approves the call the sheet is showing', async () => {
    const { onRespond } = render();

    await press(allowLabel);

    // These three ids are the entire payload: the runtime matches the decision
    // back to the paused message and to the SDK's own approval by them, so a
    // wrong one settles nothing and the turn stays stuck.
    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
    });
  });

  test('cannot be dismissed while an approval is pending', () => {
    render();

    expect(renderer.root.findByType(BottomSheet).props.isCloseDisabled).toBe(true);
  });

  test('denies the call the sheet is showing', async () => {
    const { onRespond } = render();

    await press(denyLabel);

    // Same payload, inverted verdict — the one bit that decides whether the
    // tool runs, and the easiest thing to write backwards.
    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: false,
      messageId: 'assistant-1',
    });
  });

  test('uses a solid danger action for denial', () => {
    render();

    expect(findButton(denyLabel)?.props.variant).toBe('danger');
    expect(findButton(allowLabel)?.props.variant).toBe('primary');
  });

  test('ignores a second decision while the first is still in flight', async () => {
    let settle!: () => void;
    const { onRespond } = render({
      onRespond: () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    });

    await act(async () => {
      findButton(allowLabel)?.props.onPress();
      await Promise.resolve();
    });

    expect(findButton(allowLabel)?.props.isDisabled).toBe(true);
    expect(findButton(denyLabel)?.props.isDisabled).toBe(true);

    // Disabled is what the user sees; the guard in `submit` is what actually
    // holds. A second response to an approval already being settled comes back
    // as invalidOperation, and the sheet would re-present it with no
    // explanation.
    await press(denyLabel);
    expect(onRespond).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
    });
    expect(findButton(allowLabel)?.props.isDisabled).toBe(false);
  });

  test('keeps the decided request on screen while the sheet closes', () => {
    const { rerender } = render();

    rerender([]);

    // The list empties the instant the last decision lands, but the sheet is
    // still animating out — dropping the request here flashes an empty card on
    // the way off screen.
    expect(renderedTexts()).toContain('serverOne: searchDocs');
  });

  test('says how many approvals are still queued behind this one', () => {
    render({
      approvals: [makeApproval(), makeApproval({ approvalId: 'approval-2', toolCallId: 'call-2' })],
    });

    expect(renderedTexts()).toContain('chat.tool.approval.pendingCount {"count":2}');
  });

  test('advances to the next approval without closing the sheet', () => {
    const { rerender } = render({
      approvals: [makeApproval(), makeApproval({ approvalId: 'approval-2', toolCallId: 'call-2' })],
    });

    rerender([
      makeApproval({
        approvalId: 'approval-2',
        toolCallId: 'call-2',
        toolName: 'mcp__serverTwo__createFile',
      }),
    ]);

    expect(renderedTexts()).toContain('serverTwo: createFile');
    expect(renderer.root.findByType(BottomSheet).props.isOpen).toBe(true);
  });

  test('formats built-in tool names without exposing the internal prefix', () => {
    render({
      approvals: [
        makeApproval({
          toolName: 'builtin_get_current_location',
          toolType: 'builtin',
        }),
      ],
    });

    expect(renderedTexts()).toContain('chat.builtinTool.location.current');
    expect(renderedTexts()).not.toContain('builtin_get_current_location');
  });
});
