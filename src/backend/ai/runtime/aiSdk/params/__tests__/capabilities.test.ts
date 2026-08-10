import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { resolveCapabilities } from '../capabilities';

describe('resolveCapabilities', () => {
  test('never enables provider-native image output for ordinary chat', () => {
    const model = {
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      id: 'google::gemini-2.5-flash-image' as UniqueModelId,
      modelId: 'gemini-2.5-flash-image',
      providerId: 'google',
    } as Model;
    const assistant = {
      modelId: model.id,
      settings: DEFAULT_ASSISTANT_SETTINGS,
    } as Assistant;

    const capabilities = resolveCapabilities(
      model,
      { id: 'google' } as Provider,
      assistant,
      'google',
      { getMultipleRawCached: jest.fn(() => ({})) } as never,
    );

    expect(capabilities.enableGenerateImage).toBe(false);
  });
});
