import type { ReactNode } from 'react';
import { Profiler, useState } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentApprovalView } from '@/shared/contracts/agent';

import { ToolApprovalGate } from '../ToolApprovalGate';
import type { ToolApprovalSheet } from '../ToolApprovalSheet';

const mockAlertShow = jest.fn();
const mockComposerRender = jest.fn();
const mockRespondApproval = jest.fn(async () => undefined);
const mockRunInputReplacement = jest.fn(async (present: () => unknown) => present());
let mockApprovals: readonly AgentApprovalView[] = [];
let mockSheetProps: Parameters<typeof ToolApprovalSheet>[0] | undefined;

jest.mock('@cherrystudio/app-icons/icons/chevron-up', () => () => null);

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key} ${JSON.stringify(options)}` : key,
  }),
}));

jest.mock('@/frontend/components/composer', () => ({
  useComposerPresentationActions: () => ({ runInputReplacement: mockRunInputReplacement }),
}));

jest.mock('../../runtime', () => ({
  useAgentChatActions: () => ({ respondApproval: mockRespondApproval }),
  useAgentChatPendingApprovals: () => mockApprovals,
}));

jest.mock('../ToolApprovalSheet', () => ({
  ToolApprovalSheet: (props: Parameters<typeof ToolApprovalSheet>[0]) => {
    mockSheetProps = props;
    return null;
  },
}));

function makeApproval(id = 'approval-1'): AgentApprovalView {
  return {
    displayName: 'Server One: Search docs',
    id,
    input: { query: 'cherry' },
    sessionId: 'session-1',
    status: 'pending',
    toolCallId: 'call-1',
    toolRef: { capabilityId: 'web_search', source: 'builtin' },
    turnId: 'turn-1',
  };
}

let composerMountCount = 0;

function ComposerProbe() {
  const [instance] = useState(() => ++composerMountCount);
  return <View testID={`composer-${instance}`} />;
}

function element(
  children: ReactNode = (
    <Profiler id="composer" onRender={mockComposerRender}>
      <ComposerProbe />
    </Profiler>
  ),
) {
  return <ToolApprovalGate sessionId="session-1">{children}</ToolApprovalGate>;
}

describe('ToolApprovalGate', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    composerMountCount = 0;
    mockApprovals = [makeApproval()];
    mockSheetProps = undefined;
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('collapses into a recoverable bar without rerendering or remounting the composer', async () => {
    act(() => {
      renderer = create(element());
    });

    expect(mockSheetProps?.isOpen).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'tool-approval-collapsed' })).toHaveLength(0);
    expect(composerMountCount).toBe(1);
    expect(mockComposerRender).toHaveBeenCalledTimes(1);

    act(() => mockSheetProps?.onClose());

    expect(mockSheetProps?.isOpen).toBe(false);
    expect(renderer.root.findAllByProps({ testID: 'tool-approval-collapsed' })).toHaveLength(1);
    expect(composerMountCount).toBe(1);
    expect(mockComposerRender).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.root.findByProps({ testID: 'tool-approval-collapsed' }).props.onPress();
    });

    expect(mockRunInputReplacement).toHaveBeenCalledTimes(1);
    expect(mockSheetProps?.isOpen).toBe(true);
    expect(composerMountCount).toBe(1);
    expect(mockComposerRender).toHaveBeenCalledTimes(1);
  });

  test('sends an explicit decision through the current Session client', async () => {
    act(() => {
      renderer = create(element());
    });

    await act(async () => {
      await mockSheetProps?.onRespond({ approvalId: 'approval-1', approved: true });
    });

    expect(mockRespondApproval).toHaveBeenCalledWith('session-1', 'approval-1', 'approve');
  });

  test('opens a newly selected approval after the previous one was collapsed', () => {
    act(() => {
      renderer = create(element());
    });
    act(() => mockSheetProps?.onClose());
    expect(mockSheetProps?.isOpen).toBe(false);

    mockApprovals = [makeApproval('approval-2')];
    act(() => renderer.update(element()));

    expect(mockSheetProps?.isOpen).toBe(true);
    expect(renderer.root.findAllByProps({ testID: 'tool-approval-collapsed' })).toHaveLength(0);
  });
});
