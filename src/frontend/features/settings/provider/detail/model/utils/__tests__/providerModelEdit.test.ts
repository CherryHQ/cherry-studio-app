import type { Model } from '@/shared/data/types/model';

import { buildModelEditPatch, createModelEditDraft } from '../providerModelEdit';

const model = {
  name: 'Catalog model',
  modelId: 'model',
  providerId: 'provider',
  contextWindow: 128000,
} as Model;

describe('model editing', () => {
  it('only patches changed fields and preserves catalog limits and model identity', () => {
    const initial = createModelEditDraft(model);
    expect(buildModelEditPatch(initial, { ...initial, name: ' My model ' })).toEqual({
      name: 'My model',
    });
    expect(buildModelEditPatch(initial, initial)).toEqual({});
  });

  it('rejects invalid limits without silently discarding a cleared stored limit', () => {
    const initial = createModelEditDraft(model);
    for (const contextWindow of ['', '0', '-1', '1.5', 'invalid']) {
      expect(buildModelEditPatch(initial, { ...initial, contextWindow })).toBeNull();
    }
    expect(buildModelEditPatch(initial, { ...initial, maxOutputTokens: '8192' })).toEqual({
      maxOutputTokens: 8192,
    });
  });
});
