import { useState } from 'react';
import { act, create } from 'react-test-renderer';

import type { ModelPickerModelItem } from '@/frontend/components/ModelPicker';
import { MAX_PARALLEL_ANSWERS } from '@/shared/contracts/agent';
import { createUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

import { useChatInputModelPicker } from '../useChatInputModelPicker';

const agentModel = createUniqueModelId('provider', 'agent-model');
const other = createUniqueModelId('provider', 'other-model');
const third = createUniqueModelId('provider', 'third-model');

type Snapshot = ReturnType<typeof useChatInputModelPicker> & {
  replyModels: readonly UniqueModelId[] | null;
};

describe('useChatInputModelPicker', () => {
  test('makes one chosen model the Agent model and forgets parallel models', () => {
    const { selectModel, snapshot } = renderPicker([agentModel, other]);

    act(() => snapshot().open());
    expect(snapshot().multiSelect).toMatchObject({
      enabled: true,
      selectedModelIds: [agentModel, other],
    });
    act(() => snapshot().multiSelect.onEnabledChange(false));
    expect(snapshot().replyModels).toBeNull();
    act(() => snapshot().select(item(third)));

    expect(selectModel).toHaveBeenCalledWith(third);
    expect(snapshot()).toMatchObject({ isOpen: false, replyModels: null });
  });

  test('applies several models for the next send as they are chosen', () => {
    const { selectModel, snapshot } = renderPicker(null);

    act(() => snapshot().open());
    act(() => snapshot().multiSelect.onEnabledChange(true));
    // Multi-select starts from the Agent model, which alone asks nothing new.
    expect(snapshot().multiSelect.selectedModelIds).toEqual([agentModel]);
    expect(snapshot().replyModels).toBeNull();

    act(() => snapshot().select(item(other)));
    expect(snapshot().replyModels).toEqual([agentModel, other]);
    act(() => snapshot().close());
    expect(snapshot().replyModels).toEqual([agentModel, other]);

    act(() => snapshot().open());
    act(() => snapshot().select(item(agentModel)));
    expect(snapshot().replyModels).toBeNull();
    expect(snapshot().multiSelect.selectedModelIds).toEqual([other]);
    expect(selectModel).not.toHaveBeenCalled();
  });

  test('toggles models in pick order up to the parallel limit', () => {
    const { snapshot } = renderPicker(null);
    act(() => snapshot().open());
    act(() => snapshot().multiSelect.onEnabledChange(true));
    for (let index = 0; index < MAX_PARALLEL_ANSWERS + 1; index += 1)
      act(() => snapshot().select(item(createUniqueModelId('provider', `model-${index}`))));
    expect(snapshot().multiSelect.selectedModelIds).toHaveLength(MAX_PARALLEL_ANSWERS);
    expect(snapshot().replyModels).toHaveLength(MAX_PARALLEL_ANSWERS);
  });
});

function renderPicker(initialReplyModels: readonly UniqueModelId[] | null) {
  const selectModel = jest.fn();
  let latest: Snapshot | undefined;
  function Harness() {
    const [replyModels, setReplyModels] = useState(initialReplyModels);
    latest = {
      ...useChatInputModelPicker({
        agentId: 'agent',
        replyModels,
        selectedModelId: agentModel,
        selectModel,
        setReplyModels,
      }),
      replyModels,
    };
    return null;
  }
  act(() => {
    create(<Harness />);
  });
  return { selectModel, snapshot: () => latest! };
}

function item(modelId: UniqueModelId) {
  return { modelId } as ModelPickerModelItem;
}
