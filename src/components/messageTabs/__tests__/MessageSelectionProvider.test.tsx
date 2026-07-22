import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  MessageSelectionProvider,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '../MessageSelectionProvider';

let currentActions: ReturnType<typeof useMessageSelectionActions> | undefined;
let currentState: ReturnType<typeof useMessageSelectionState> | undefined;
let renderer: ReactTestRenderer | undefined;

function MessageSelectionProbe() {
  const actions = useMessageSelectionActions();
  const state = useMessageSelectionState();

  useEffect(() => {
    currentActions = actions;
    currentState = state;
  }, [actions, state]);

  return null;
}

beforeEach(() => {
  currentActions = undefined;
  currentState = undefined;
  renderer = undefined;
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
});

describe('MessageSelectionProvider', () => {
  test('notifies the navigator when editing starts and ends', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <MessageSelectionProvider onEditingChange={onEditingChange}>
          <MessageSelectionProbe />
        </MessageSelectionProvider>,
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
        <MessageSelectionProvider>
          <MessageSelectionProbe />
        </MessageSelectionProvider>,
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

  test('restores the tab bar when the provider unmounts while editing', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <MessageSelectionProvider onEditingChange={onEditingChange}>
          <MessageSelectionProbe />
        </MessageSelectionProvider>,
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
