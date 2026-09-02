import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  SelectionProvider,
  type SelectionSource,
  usePendingDeletionIds,
  useSelectionActions,
  useSelectionSource,
  useSelectionState,
  useRegisterSelectionSource,
} from '../SelectionProvider';

let currentActions: ReturnType<typeof useSelectionActions> | undefined;
let currentState: ReturnType<typeof useSelectionState> | undefined;
let currentSource: SelectionSource | undefined;
let currentConversationPendingIds: ReadonlySet<string> | undefined;
let currentDrawingPendingIds: ReadonlySet<string> | undefined;
let renderer: ReactTestRenderer | undefined;

function SelectionProbe() {
  const actions = useSelectionActions();
  const state = useSelectionState();
  const conversationPendingIds = usePendingDeletionIds('conversations');
  const drawingPendingIds = usePendingDeletionIds('drawings');

  useEffect(() => {
    currentActions = actions;
    currentState = state;
    currentConversationPendingIds = conversationPendingIds;
    currentDrawingPendingIds = drawingPendingIds;
  }, [actions, conversationPendingIds, drawingPendingIds, state]);

  return null;
}

function UnstableSourceBody() {
  // A brand-new source object on every render — the exact shape that used to
  // feed setState back into its own registration effect and loop forever.
  const source: SelectionSource = {
    copy: { deleteFailed: 'x', deleteMessage: 'y', deleteTitle: 'z' },
    deleteSelected: async () => undefined,
    getAllIds: () => ['a', 'b'],
  };
  useRegisterSelectionSource('conversations', source);

  return null;
}

function SourceProbe() {
  const source = useSelectionSource('conversations');

  useEffect(() => {
    currentSource = source;
  }, [source]);

  return null;
}

beforeEach(() => {
  currentActions = undefined;
  currentConversationPendingIds = undefined;
  currentDrawingPendingIds = undefined;
  currentState = undefined;
  currentSource = undefined;
  renderer = undefined;
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

describe('SelectionProvider', () => {
  test('notifies the navigator when editing starts and ends', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <SelectionProvider onEditingChange={onEditingChange}>
          <SelectionProbe />
        </SelectionProvider>,
      );
    });

    await act(async () => {
      currentActions?.enterEditing();
    });

    expect(currentState?.isEditing).toBe(true);
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      currentActions?.exitEditing();
    });

    expect(currentState?.isEditing).toBe(false);
    expect(currentState?.selectedIds).toEqual(new Set());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  test('toggles single ids and switches between select-all and clear', async () => {
    await act(async () => {
      renderer = create(
        <SelectionProvider>
          <SelectionProbe />
        </SelectionProvider>,
      );
    });

    await act(async () => {
      currentActions?.toggleId('id-1');
    });
    expect(currentState?.selectedIds).toEqual(new Set(['id-1']));

    await act(async () => {
      currentActions?.toggleAll(['id-1', 'id-2']);
    });
    expect(currentState?.selectedIds).toEqual(new Set(['id-1', 'id-2']));

    await act(async () => {
      currentActions?.toggleAll(['id-1', 'id-2']);
    });
    expect(currentState?.selectedIds).toEqual(new Set());
  });

  test('hides pending ids by scope and blocks editing until deletion finishes', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <SelectionProvider onEditingChange={onEditingChange}>
          <SelectionProbe />
        </SelectionProvider>,
      );
    });

    await act(async () => {
      currentActions?.enterEditing();
      currentActions?.toggleId('topic-1');
    });
    await act(async () => {
      currentActions?.beginDeletion('conversations', ['topic-1']);
    });

    expect(currentState).toMatchObject({ isDeletionPending: true, isEditing: false });
    expect(currentState?.selectedIds).toEqual(new Set());
    expect(currentConversationPendingIds).toEqual(new Set(['topic-1']));
    expect(currentDrawingPendingIds).toEqual(new Set());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);

    await act(async () => {
      currentActions?.enterEditing();
    });
    expect(currentState?.isEditing).toBe(false);

    await act(async () => {
      currentActions?.finishDeletion('conversations', ['topic-1']);
    });
    expect(currentState).toMatchObject({ isDeletionPending: false, isEditing: false });
    expect(currentConversationPendingIds).toEqual(new Set());
  });

  test('registers an unstable source without hitting maximum update depth', async () => {
    await act(async () => {
      renderer = create(
        <SelectionProvider>
          <UnstableSourceBody />
          <SourceProbe />
        </SelectionProvider>,
      );
    });

    expect(currentSource?.getAllIds()).toEqual(['a', 'b']);
  });

  test('reports editing off when the provider unmounts while editing', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <SelectionProvider onEditingChange={onEditingChange}>
          <SelectionProbe />
        </SelectionProvider>,
      );
      currentActions?.enterEditing();
    });

    await act(async () => {
      renderer?.unmount();
      renderer = undefined;
    });

    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });
});
