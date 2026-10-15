import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSource, ConversationSummary } from '@/frontend/appShell/conversation';

import {
  SidebarSelectionProvider,
  useSidebarSelection,
  useSidebarSelectionSnapshot,
} from '../SidebarSelectionProvider';

const mockConfirm = jest.fn();
const mockToast = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('@cherrystudio/ui/motion', () => ({ duration: { fast: 0 }, easing: { settle: 0 } }));
jest.mock('expo-router/drawer', () => ({ useDrawerStatus: () => 'open' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-reanimated', () => ({
  cancelAnimation: jest.fn(),
  ReduceMotion: { System: 'system' },
  useSharedValue: () => ({ set: jest.fn() }),
  withTiming: (value: number) => value,
}));

test('a restored batch-deleted session becomes visible and selectable without remounting the sidebar', async () => {
  let selection!: ReturnType<typeof useSidebarSelection>;
  let hidden = false;
  const key = JSON.stringify(['local-source', 'session']);
  function Probe() {
    const store = useSidebarSelection();
    const deleted = useSidebarSelectionSnapshot((state) => state.deletedIds.has(key));
    useEffect(() => {
      selection = store;
      hidden = deleted;
    }, [deleted, store]);
    return null;
  }
  const source = {
    scope: 'local-source',
    ref: { kind: 'local' },
    state: { getSnapshot: () => ({ availability: { state: 'enabled' } }) },
    catalog: {
      previewSession: () => ({
        remove: { availability: { state: 'enabled' }, execute: async () => ({ state: 'applied' }) },
      }),
    },
  } as unknown as ConversationSource;
  const session: ConversationSummary = {
    ref: { source: { kind: 'local' }, sessionId: 'session' },
    agentId: 'agent',
    title: 'Conversation',
  };
  let finishRefresh!: () => void;
  const refresh = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <SidebarSelectionProvider scope="local">
        <Probe />
      </SidebarSelectionProvider>,
    );
  });
  try {
    act(() => {
      selection.registerList('recents', source, [session], refresh);
      selection.enter(key);
    });
    act(() => selection.requestDelete());
    await act(async () => {
      mockConfirm.mock.calls.at(-1)![0].onConfirm();
    });
    expect(hidden).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      selection.registerList('recents', source, [], refresh);
      finishRefresh();
    });
    // The same catalog later reports restoration with the original identity.
    act(() => {
      selection.registerList('recents', source, [session], refresh);
    });
    expect(hidden).toBe(false);
    expect(selection.shownIds()).toEqual([key]);
    act(() => {
      selection.enter(key);
      selection.toggle(key);
    });
    expect(selection.getSnapshot().selectedIds.size).toBe(0);
  } finally {
    act(() => renderer.unmount());
  }
});
