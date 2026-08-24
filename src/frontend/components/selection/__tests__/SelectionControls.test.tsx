import { useEffect, useMemo } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  SelectionProvider,
  type SelectionSource,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';

import { SelectionControls } from '../SelectionControls';

type ConfirmationOptions = {
  onConfirm: () => void;
};

const mockAlertConfirm = jest.fn((options: ConfirmationOptions) => {
  currentConfirmation = options;
});
const mockAlertShow = jest.fn();
let currentActions: ReturnType<typeof useSelectionActions> | undefined;
let currentConfirmation: ConfirmationOptions | undefined;
let currentPendingIds: ReadonlySet<string> | undefined;
let currentState: ReturnType<typeof useSelectionState> | undefined;
let deletion = deferred<void>();
let mockDeleteSelected = jest.fn<Promise<void>, [readonly string[]]>(() => deletion.promise);
let renderer: ReactTestRenderer | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({
    alert: {
      confirm: mockAlertConfirm,
      show: mockAlertShow,
    },
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../SelectionToolbar/SelectionToolbar', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return {
    SelectionToolbar: ({ onDelete }: { onDelete: () => void }) => (
      <MockPressable onPress={onDelete} testID="selection-delete" />
    ),
  };
});

function SelectionProbe() {
  const actions = useSelectionActions();
  const state = useSelectionState();
  const pendingIds = usePendingDeletionIds('conversations');

  useEffect(() => {
    currentActions = actions;
    currentPendingIds = pendingIds;
    currentState = state;
  }, [actions, pendingIds, state]);

  return null;
}

function SelectionSourceRegistration() {
  const source = useMemo<SelectionSource>(
    () => ({
      copy: {
        deleteFailed: 'delete.failed',
        deleteMessage: 'delete.message',
        deleteTitle: 'delete',
      },
      deleteSelected: (ids) => mockDeleteSelected(ids),
      getAllIds: () => ['topic-1', 'topic-2'],
    }),
    [],
  );
  useRegisterSelectionSource('conversations', source);

  return null;
}

describe('SelectionControls', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    currentActions = undefined;
    currentConfirmation = undefined;
    currentPendingIds = undefined;
    currentState = undefined;
    deletion = deferred<void>();
    mockDeleteSelected = jest.fn<Promise<void>, [readonly string[]]>(() => deletion.promise);

    await act(async () => {
      renderer = create(
        <SelectionProvider>
          <SelectionSourceRegistration />
          <SelectionProbe />
          <SelectionControls scope="conversations" />
        </SelectionProvider>,
      );
    });

    await act(async () => {
      currentActions?.enterEditing();
      currentActions?.toggleId('topic-1');
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('hides selected ids and exits editing before the deletion settles', async () => {
    await act(async () => {
      renderer?.root.findByProps({ testID: 'selection-delete' }).props.onPress();
    });

    act(() => {
      currentConfirmation?.onConfirm();
    });

    expect(mockDeleteSelected).toHaveBeenCalledWith(['topic-1']);
    expect(currentState).toMatchObject({ isDeletionPending: true, isEditing: false });
    expect(currentPendingIds).toEqual(new Set(['topic-1']));
    expect(renderer?.root.findAllByProps({ testID: 'selection-delete' })).toHaveLength(0);

    await act(async () => {
      deletion.resolve();
      await deletion.promise;
    });

    expect(currentState).toMatchObject({ isDeletionPending: false, isEditing: false });
    expect(currentPendingIds).toEqual(new Set());
  });

  it('clears pending ids and queues an error without restoring editing after failure', async () => {
    await act(async () => {
      renderer?.root.findByProps({ testID: 'selection-delete' }).props.onPress();
    });

    act(() => {
      currentConfirmation?.onConfirm();
    });

    await act(async () => {
      deletion.reject(new Error('delete failed'));
      await deletion.promise.catch(() => undefined);
    });

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'delete.failed' });
    expect(currentState).toMatchObject({ isDeletionPending: false, isEditing: false });
    expect(currentPendingIds).toEqual(new Set());
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
