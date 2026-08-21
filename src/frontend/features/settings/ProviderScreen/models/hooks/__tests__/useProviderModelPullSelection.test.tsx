import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { ProviderModelPullPreview } from '../../utils/providerModelPullPreview';
import {
  type ProviderModelPullApplyChange,
  useProviderModelPullSelection,
} from '../useProviderModelPullSelection';

type PullSelection = ReturnType<typeof useProviderModelPullSelection>;

const newModel = model('gpt-4o');
const otherNewModel = model('gpt-4o-mini');
const goneModel = model('old-model');
const preview: ProviderModelPullPreview = {
  added: [newModel, otherNewModel],
  missing: [goneModel],
};

describe('useProviderModelPullSelection', () => {
  let renderer: ReactTestRenderer | undefined;
  let selection: PullSelection | undefined;

  function Probe({
    applyModelChange,
    preview: previewProp,
  }: {
    applyModelChange: ProviderModelPullApplyChange;
    preview: ProviderModelPullPreview;
  }) {
    selection = useProviderModelPullSelection({ applyModelChange, preview: previewProp });
    return null;
  }

  function mount(applyModelChange: ProviderModelPullApplyChange) {
    act(() => {
      renderer = create(<Probe applyModelChange={applyModelChange} preview={preview} />);
    });

    return current();
  }

  function current() {
    if (!selection) {
      throw new Error('useProviderModelPullSelection probe was not rendered.');
    }

    return selection;
  }

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    selection = undefined;
  });

  // Taking the whole catalogue is the usual answer, so the additions arrive
  // ticked. The removals do not: nothing gets deleted unless the user said so.
  it('starts with the new models ticked and no removal armed', () => {
    mount(jest.fn().mockResolvedValue(true));

    expect([...current().selectedIds]).toEqual([newModel.id, otherNewModel.id]);
  });

  // Nothing is written until the pull is confirmed, so ticking a row is just
  // a tick — the tap that deletes a model is the one on "Apply".
  it('writes nothing while models are being ticked', () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    act(() => current().toggleModel(goneModel.id));
    act(() => current().toggleModel(newModel.id));

    expect(applyModelChange).not.toHaveBeenCalled();
    expect([...current().selectedIds]).toEqual([otherNewModel.id, goneModel.id]);
  });

  it('unticks a model on the second tap', () => {
    mount(jest.fn().mockResolvedValue(true));

    act(() => current().toggleModel(goneModel.id));
    act(() => current().toggleModel(goneModel.id));

    expect(current().selectedIds.has(goneModel.id)).toBe(false);
  });

  // Both halves of the reconcile go in one call: ticked `added` rows are the
  // models to create, ticked `missing` rows the ones to drop.
  it('sends both halves of the selection as one change', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    act(() => current().toggleModel(otherNewModel.id));
    act(() => current().toggleModel(goneModel.id));
    await act(async () => {
      await current().applySelection();
    });

    expect(applyModelChange).toHaveBeenCalledWith({
      toAdd: [newModel],
      toRemove: [goneModel.id],
    });
  });

  it('applies nothing when nothing is ticked', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    act(() => current().toggleAll([newModel.id, otherNewModel.id]));

    let didApply: boolean | undefined;
    await act(async () => {
      didApply = await current().applySelection();
    });

    expect(applyModelChange).not.toHaveBeenCalled();
    expect(didApply).toBe(false);
  });

  it('reports the write as in flight until it lands', async () => {
    let resolveApply: ((didApply: boolean) => void) | undefined;
    const applyModelChange = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveApply = resolve;
        }),
    );
    mount(applyModelChange);

    act(() => {
      void current().applySelection();
    });

    expect(current().isApplying).toBe(true);

    await act(async () => resolveApply?.(true));

    expect(current().isApplying).toBe(false);
  });

  // Scoped to the ids it is handed, so a section's own select-all — or one over
  // what a search left on screen — leaves the rest of the selection alone.
  it('selects the ids it is given, then unselects them once they are all in', () => {
    mount(jest.fn().mockResolvedValue(true));

    act(() => current().toggleAll([goneModel.id]));

    expect([...current().selectedIds]).toEqual([newModel.id, otherNewModel.id, goneModel.id]);

    act(() => current().toggleAll([goneModel.id]));

    expect([...current().selectedIds]).toEqual([newModel.id, otherNewModel.id]);
  });

  it('completes a partial selection rather than clearing it', () => {
    mount(jest.fn().mockResolvedValue(true));

    act(() => current().toggleModel(otherNewModel.id));
    act(() => current().toggleAll([newModel.id, otherNewModel.id]));

    expect([...current().selectedIds]).toEqual([newModel.id, otherNewModel.id]);
  });

  it('starts the next pull from its own default rather than the last one', () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    const nextModel = model('gpt-5');
    mount(applyModelChange);

    act(() => current().toggleModel(goneModel.id));
    act(() => {
      renderer?.update(
        <Probe applyModelChange={applyModelChange} preview={{ added: [nextModel], missing: [] }} />,
      );
    });

    expect([...current().selectedIds]).toEqual([nextModel.id]);
  });
});

function model(modelId: string): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('openai', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'openai',
    supportsStreaming: true,
  };
}
