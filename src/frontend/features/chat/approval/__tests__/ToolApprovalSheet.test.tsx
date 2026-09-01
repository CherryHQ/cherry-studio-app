import { BottomSheet, Button } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { ScrollView, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type PendingToolApproval, ToolApprovalSheet } from '../ToolApprovalSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Interpolation values are half of what this sheet gets right or wrong — a
    // pending count rendered without its count would read as passing.
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');

  function MockButton({ children, ...props }: { children?: ReactNode }) {
    return <MockView {...props}>{children}</MockView>;
  }
  MockButton.Label = MockText;

  function MockBottomSheet({ children, ...props }: { children?: ReactNode }) {
    return <MockView {...props}>{children}</MockView>;
  }

  return {
    BottomSheet: MockBottomSheet,
    Button: MockButton,
  };
});

const allowLabel = 'chat.tool.approval.allow';
const denyLabel = 'chat.tool.approval.deny';

function makeApproval(overrides: Partial<PendingToolApproval> = {}): PendingToolApproval {
  return {
    approvalId: 'approval-1',
    input: { query: 'cherry' },
    messageId: 'assistant-1',
    toolCallId: 'call-1',
    displayName: 'Server One: Search docs',
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

    expect(renderer.root.findByType(BottomSheet).props.dismissible).toBe(false);
  });

  test('does not mount a sheet before an approval exists', () => {
    act(() => {
      renderer = create(<ToolApprovalSheet approvals={[]} isOpen={false} onRespond={jest.fn()} />);
    });

    expect(renderer.root.findAllByType(BottomSheet)).toHaveLength(0);
  });

  test('hides the arguments preview scroll indicator', () => {
    render();

    expect(renderer.root.findByType(ScrollView).props.showsVerticalScrollIndicator).toBe(false);
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

    expect(findButton(denyLabel)?.props.variant).toBe('destructive');
    expect(findButton(allowLabel)?.props.variant).toBe('default');
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

    expect(findButton(allowLabel)?.props.disabled).toBe(true);
    expect(findButton(denyLabel)?.props.disabled).toBe(true);

    // Disabled is what the user sees; the guard in `submit` is what actually
    // holds. A second response to an approval already being settled comes back
    // as invalidOperation, and the sheet would re-present it with no
    // explanation.
    await press(denyLabel);
    expect(onRespond).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
    });
    expect(findButton(allowLabel)?.props.disabled).toBe(false);
  });

  test('keeps the decided request on screen while the sheet closes', () => {
    const { rerender } = render();

    rerender([]);

    // The list empties the instant the last decision lands, but the sheet is
    // still animating out — dropping the request here flashes an empty card on
    // the way off screen.
    expect(renderedTexts()).toContain('Server One: Search docs');
  });

  test('resets the submitting state when the sheet advances to another approval', async () => {
    let settle!: () => void;
    const { rerender } = render({
      onRespond: () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    });

    await act(async () => {
      findButton(allowLabel)?.props.onPress();
      await Promise.resolve();
    });
    expect(findButton(allowLabel)?.props.disabled).toBe(true);

    rerender([
      makeApproval({
        approvalId: 'approval-2',
        displayName: 'Server Two: Create file',
        toolCallId: 'call-2',
      }),
    ]);

    expect(findButton(allowLabel)?.props.disabled).toBe(false);
    await act(async () => settle());
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
        displayName: 'Server Two: Create file',
      }),
    ]);

    expect(renderedTexts()).toContain('Server Two: Create file');
    expect(renderer.root.findByType(BottomSheet).props.open).toBe(true);
  });

  test('renders the snapshotted display name without exposing the provider alias', () => {
    render({
      approvals: [
        makeApproval({
          displayName: 'Get current location',
        }),
      ],
    });

    expect(renderedTexts()).toContain('Get current location');
    expect(renderedTexts()).not.toContain('location_get_current');
  });
});
