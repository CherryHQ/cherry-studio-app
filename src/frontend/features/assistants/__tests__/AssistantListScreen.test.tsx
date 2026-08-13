import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import AssistantListScreen from '../AssistantListScreen';

type ConfirmationOptions = { onConfirm: () => Promise<void> | void };

const assistantA = { emoji: 'A', id: 'assistant-a', name: 'Assistant A' } as Assistant;
const assistantB = { emoji: 'B', id: 'assistant-b', name: 'Assistant B' } as Assistant;
const mockDeleteAssistant = jest.fn(async () => undefined);
const mockPush = jest.fn();
const mockSetBottomTabBarHidden = jest.fn();
const mockAlertConfirm = jest.fn((options: ConfirmationOptions) => {
  currentConfirmation = options;
});
const mockAlertShow = jest.fn();
let currentConfirmation: ConfirmationOptions | undefined;
let deletion = deferred<void>();
let mockAssistants: readonly Assistant[] = [assistantA, assistantB];
let mockDeleteAssistants = jest.fn(() => deletion.promise);

jest.mock('expo-router', () => ({
  Stack: { SearchBar: () => null },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@cherrystudio/app-icons', () => ({
  BotIcon: () => null,
  CheckIcon: () => null,
  PlusIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    FadeInLeft: { duration: () => undefined },
    FadeOutLeft: { duration: () => undefined },
  };
});

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({
    alert: {
      confirm: mockAlertConfirm,
      show: mockAlertShow,
    },
  }),
}));

jest.mock('@/frontend/components/headers', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return {
    TabRootHeader: ({
      leftActions,
    }: {
      leftActions: { disabled?: boolean; onPress: () => void }[];
    }) => (
      <MockPressable
        disabled={leftActions[0]?.disabled}
        onPress={leftActions[0]?.onPress}
        testID="assistant-edit"
      />
    ),
  };
});

jest.mock('@/frontend/components/messageTabs', () => ({
  ...jest.requireActual('@/frontend/components/messageTabs'),
  useMessageListBottomInset: () => 0,
}));

jest.mock('@/frontend/components/messageTabs/SelectionToolbar/SelectionToolbar', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return {
    SelectionToolbar: ({ onDelete }: { onDelete: () => void }) => (
      <MockPressable onPress={onDelete} testID="assistant-selection-delete" />
    ),
  };
});

jest.mock('@/frontend/components/navigation', () => ({
  ContextMenuLink: ({ children, ...props }: { children: ReactNode }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');

    return React.createElement(View, { ...props, testID: 'assistant-context-link' }, children);
  },
  useSetBottomTabBarHidden: () => mockSetBottomTabBarHidden,
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantMutations: () => ({
    deleteAssistant: mockDeleteAssistant,
    deleteAssistants: mockDeleteAssistants,
  }),
  useAssistantsApi: () => ({ assistants: mockAssistants, isLoading: false }),
}));

describe('AssistantListScreen batch deletion', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    currentConfirmation = undefined;
    deletion = deferred<void>();
    mockAssistants = [assistantA, assistantB];
    mockDeleteAssistants = jest.fn(() => deletion.promise);

    await act(async () => {
      renderer = create(<AssistantListScreen />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  async function selectAssistantAForDeletion() {
    await act(async () => {
      renderer?.root.findByProps({ testID: 'assistant-edit' }).props.onPress();
    });
    await act(async () => {
      renderer?.root
        .findByProps({ accessibilityLabel: assistantA.name })
        .props.onAccessibilityAction();
    });
    await act(async () => {
      renderer?.root.findByProps({ testID: 'assistant-selection-delete' }).props.onPress();
    });
  }

  it('links to assistant details and exposes edit and delete context actions', async () => {
    const link = renderer?.root.findAllByProps({ testID: 'assistant-context-link' })[0];
    expect(link?.props.href).toEqual({
      pathname: '/assistants/[assistantId]',
      params: { assistantId: 'assistant-a' },
    });
    expect(link?.props.preview).toBe(false);

    const editAction = link?.props.items.find((item: { id: string }) => item.id === 'edit');
    const deleteAction = link?.props.items.find((item: { id: string }) => item.id === 'delete');

    await act(async () => editAction?.onPress());
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/assistants/[assistantId]/edit',
      params: { assistantId: 'assistant-a' },
    });

    await act(async () => deleteAction?.onPress());
    expect(mockAlertConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'destructive', title: 'assistant.delete.title' }),
    );
  });

  it('keeps a divider between assistant rows', () => {
    const row = renderer?.root.findByProps({ accessibilityLabel: assistantA.name });
    const divider = row?.findAll(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('border-b') &&
        node.props.className.includes('border-border'),
    );

    expect(divider?.length).toBeGreaterThan(0);
  });

  it('hides the selected assistant before the batch request settles', async () => {
    await selectAssistantAForDeletion();

    act(() => {
      void currentConfirmation?.onConfirm();
    });

    expect(mockDeleteAssistants).toHaveBeenCalledWith(['assistant-a']);
    expect(renderer?.root.findAllByProps({ accessibilityLabel: assistantA.name })).toHaveLength(0);
    expect(renderer?.root.findAllByProps({ accessibilityLabel: assistantB.name })).not.toHaveLength(
      0,
    );
    expect(renderer?.root.findAllByProps({ testID: 'assistant-selection-delete' })).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'assistant-edit' }).props.disabled).toBe(true);

    mockAssistants = [assistantB];
    await act(async () => {
      deletion.resolve();
      await deletion.promise;
    });

    expect(renderer?.root.findAllByProps({ accessibilityLabel: assistantA.name })).toHaveLength(0);
  });

  it('restores the assistant after failure without returning to editing', async () => {
    await selectAssistantAForDeletion();

    act(() => {
      void currentConfirmation?.onConfirm();
    });
    await act(async () => {
      deletion.reject(new Error('delete failed'));
      await deletion.promise.catch(() => undefined);
    });

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'assistant.selection.deleteFailed' });
    expect(renderer?.root.findAllByProps({ accessibilityLabel: assistantA.name })).not.toHaveLength(
      0,
    );
    expect(renderer?.root.findAllByProps({ testID: 'assistant-selection-delete' })).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'assistant-edit' }).props.disabled).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
