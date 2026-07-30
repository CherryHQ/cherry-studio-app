import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/domain/model';

import type { ProviderModelPullPreview } from '../../utils/providerModelPullPreview';
import {
  type ProviderModelPullApplyChange,
  useProviderModelPullApply,
} from '../useProviderModelPullApply';

type PullApply = ReturnType<typeof useProviderModelPullApply>;

const newModel = model('gpt-4o');
const otherNewModel = model('gpt-4o-mini');
const goneModel = model('old-model');
const preview: ProviderModelPullPreview = {
  added: [newModel, otherNewModel],
  missing: [goneModel],
};

describe('useProviderModelPullApply', () => {
  let renderer: ReactTestRenderer | undefined;
  let apply: PullApply | undefined;

  function Probe({
    applyModelChange,
    preview: previewProp,
  }: {
    applyModelChange: ProviderModelPullApplyChange;
    preview: ProviderModelPullPreview;
  }) {
    apply = useProviderModelPullApply({ applyModelChange, preview: previewProp });
    return null;
  }

  function mount(applyModelChange: ProviderModelPullApplyChange) {
    act(() => {
      renderer = create(<Probe applyModelChange={applyModelChange} preview={preview} />);
    });

    return current();
  }

  function current() {
    if (!apply) {
      throw new Error('useProviderModelPullApply probe was not rendered.');
    }

    return apply;
  }

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    apply = undefined;
  });

  it('adds a new model on the first tap and removes it again on the second', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    await act(async () => current().toggleModel(newModel, 'added'));

    expect(applyModelChange).toHaveBeenLastCalledWith({ toAdd: [newModel] });
    expect(current().appliedIds.has(newModel.id)).toBe(true);

    await act(async () => current().toggleModel(newModel, 'added'));

    expect(applyModelChange).toHaveBeenLastCalledWith({ toRemove: [newModel.id] });
    expect(current().appliedIds.has(newModel.id)).toBe(false);
  });

  // A `missing` row is already in the provider, so applying it means deleting it.
  it('removes a missing model on the first tap and restores it on the second', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    await act(async () => current().toggleModel(goneModel, 'missing'));

    expect(applyModelChange).toHaveBeenLastCalledWith({ toRemove: [goneModel.id] });

    await act(async () => current().toggleModel(goneModel, 'missing'));

    expect(applyModelChange).toHaveBeenLastCalledWith({ toAdd: [goneModel] });
    expect(current().appliedIds.has(goneModel.id)).toBe(false);
  });

  it('flips the row before the write lands and rolls it back on failure', async () => {
    let resolveApply: ((didApply: boolean) => void) | undefined;
    const applyModelChange = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveApply = resolve;
        }),
    );
    mount(applyModelChange);

    act(() => {
      current().toggleModel(newModel, 'added');
    });

    expect(current().appliedIds.has(newModel.id)).toBe(true);
    expect(current().pendingIds.has(newModel.id)).toBe(true);

    await act(async () => resolveApply?.(false));

    expect(current().appliedIds.has(newModel.id)).toBe(false);
    expect(current().pendingIds.has(newModel.id)).toBe(false);
  });

  it('ignores a second tap while the first one is still in flight', async () => {
    let resolveApply: ((didApply: boolean) => void) | undefined;
    const applyModelChange = jest.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveApply = resolve;
        }),
    );
    mount(applyModelChange);

    act(() => {
      current().toggleModel(newModel, 'added');
    });
    act(() => {
      current().toggleModel(newModel, 'added');
    });

    expect(applyModelChange).toHaveBeenCalledTimes(1);

    await act(async () => resolveApply?.(true));
  });

  it('applies what is left of a section and undoes the section once everything has landed', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    await act(async () => current().toggleModel(newModel, 'added'));
    await act(async () => current().toggleSection(preview.added, 'added'));

    expect(applyModelChange).toHaveBeenLastCalledWith({ toAdd: [otherNewModel] });

    await act(async () => current().toggleSection(preview.added, 'added'));

    expect(applyModelChange).toHaveBeenLastCalledWith({
      toRemove: [newModel.id, otherNewModel.id],
    });
    expect(current().appliedIds.size).toBe(0);
  });

  it('forgets what landed against the previous pull', async () => {
    const applyModelChange = jest.fn().mockResolvedValue(true);
    mount(applyModelChange);

    await act(async () => current().toggleModel(newModel, 'added'));

    expect(current().appliedIds.size).toBe(1);

    act(() => {
      renderer?.update(
        <Probe
          applyModelChange={applyModelChange}
          preview={{ added: [model('gpt-5')], missing: [] }}
        />,
      );
    });

    expect(current().appliedIds.size).toBe(0);
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
