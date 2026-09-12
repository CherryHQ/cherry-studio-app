import { ENDPOINT_TYPE, MODALITY, MODEL_CAPABILITY, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { changeProviderModelPrimaryType } from '../../../../models/utils/providerModelAdd';
import {
  buildModelEditPatch,
  buildModelEditSettingsPatch,
  createModelEditDraft,
  createModelEditSettings,
} from '../providerModelEdit';

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

  it('rejects invalid limits and explicitly resets cleared limits', () => {
    const initial = createModelEditDraft(model);
    for (const contextWindow of ['0', '-1', '1.5', 'invalid']) {
      expect(buildModelEditPatch(initial, { ...initial, contextWindow })).toBeNull();
    }
    expect(buildModelEditPatch(initial, { ...initial, maxOutputTokens: '8192' })).toEqual({
      maxOutputTokens: 8192,
    });
    expect(buildModelEditPatch(initial, { ...initial, contextWindow: '' })).toEqual({
      contextWindow: null,
    });
  });
});

const provider = {
  id: 'provider',
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs: {
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { baseUrl: 'https://example.com/v1' },
  },
} as Provider;

const catalogModel: Model = {
  ...model,
  id: 'provider::model',
  capabilities: [
    MODEL_CAPABILITY.REASONING,
    MODEL_CAPABILITY.FUNCTION_CALL,
    MODEL_CAPABILITY.WEB_SEARCH,
  ],
  endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_RESPONSES],
  inputModalities: [MODALITY.TEXT, MODALITY.IMAGE, MODALITY.AUDIO],
  supportsStreaming: true,
  isEnabled: true,
  isHidden: false,
};

describe('model configuration edits', () => {
  it('preserves untouched metadata and all declared endpoints', () => {
    const initial = createModelEditSettings(catalogModel);
    expect(buildModelEditSettingsPatch(catalogModel, provider, initial)).toEqual({ patch: {} });
    expect(
      buildModelEditSettingsPatch(catalogModel, provider, { ...initial, supportsStreaming: false }),
    ).toEqual({ patch: { supportsStreaming: false } });
  });

  it('updates input modalities and capabilities without erasing unrelated capabilities', () => {
    const settings = {
      ...createModelEditSettings(catalogModel),
      capabilities: { reasoning: false, functionCall: false, vision: false, video: true },
    };
    expect(buildModelEditSettingsPatch(catalogModel, provider, settings).patch).toEqual({
      capabilities: [MODEL_CAPABILITY.WEB_SEARCH, MODEL_CAPABILITY.VIDEO_RECOGNITION],
      inputModalities: [MODALITY.TEXT, MODALITY.AUDIO, MODALITY.VIDEO],
    });
  });

  it('switches a drawing model to text together with its endpoint and output modality', () => {
    const drawing: Model = {
      ...catalogModel,
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
      outputModalities: [MODALITY.IMAGE],
    };
    const settings = changeProviderModelPrimaryType(
      createModelEditSettings(drawing),
      'text',
      provider,
      drawing,
    );
    expect(buildModelEditSettingsPatch(drawing, provider, settings).patch).toMatchObject({
      capabilities: [],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
      outputModalities: [MODALITY.TEXT],
    });
  });

  it('restores the original settings after undoing a type change', () => {
    const initial = createModelEditSettings(catalogModel);
    const image = changeProviderModelPrimaryType(initial, 'image', provider, catalogModel);
    expect(changeProviderModelPrimaryType(image, 'text', provider, catalogModel)).toEqual(initial);
  });
});
