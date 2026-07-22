import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  TopicListSelectionProvider,
  useTopicListSelectionActions,
  useTopicListSelectionState,
} from '../TopicListSelectionProvider';

let currentActions: ReturnType<typeof useTopicListSelectionActions> | undefined;
let currentState: ReturnType<typeof useTopicListSelectionState> | undefined;
let renderer: ReactTestRenderer | undefined;

function TopicListSelectionProbe() {
  const actions = useTopicListSelectionActions();
  const state = useTopicListSelectionState();

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

describe('TopicListSelectionProvider', () => {
  test('notifies the navigator when editing starts and ends', async () => {
    const onEditingChange = jest.fn();

    await act(async () => {
      renderer = create(
        <TopicListSelectionProvider onEditingChange={onEditingChange}>
          <TopicListSelectionProbe />
        </TopicListSelectionProvider>,
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
        <TopicListSelectionProvider>
          <TopicListSelectionProbe />
        </TopicListSelectionProvider>,
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
        <TopicListSelectionProvider onEditingChange={onEditingChange}>
          <TopicListSelectionProbe />
        </TopicListSelectionProvider>,
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
