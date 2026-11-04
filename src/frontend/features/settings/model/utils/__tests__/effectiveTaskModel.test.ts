import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { resolveEffectiveTaskModel } from '../effectiveTaskModel';

const model = (id: Model['id']): Model => ({
  id,
  providerId: id.split('::')[0]!,
  modelId: id.split('::')[1]!,
  name: id,
  capabilities: [],
  isEnabled: true,
  isHidden: false,
  supportsStreaming: false,
  inputModalities: ['text'],
});
const text = model('p::text');
const image: Model = {
  ...model('p::image'),
  imageGeneration: { modes: { generate: { supports: {} } } },
};
const providers = [
  { id: 'p', name: 'Provider' },
  { id: 'cli', name: 'CLI', authMethods: ['external-cli'] },
] as Provider[];
const common = {
  defaultId: text.id,
  configuredId: null,
  models: [text, image],
  providers,
  namingEnabled: true,
  isLoading: false,
  hasError: false,
};

describe('resolveEffectiveTaskModel', () => {
  it.each(['naming', 'translate'] as const)('%s resolves configured and default models', (kind) => {
    expect(resolveEffectiveTaskModel({ ...common, kind, configuredId: image.id })).toMatchObject({
      status: 'configured',
      model: image,
      provider: providers[0],
    });
    expect(resolveEffectiveTaskModel({ ...common, kind })).toMatchObject({
      status: 'useDefault',
      model: text,
      provider: providers[0],
    });
  });
  it('keeps an unavailable explicit translation selection', () => {
    expect(
      resolveEffectiveTaskModel({ ...common, kind: 'translate', configuredId: 'p::missing' }),
    ).toEqual({ status: 'unavailableSelection' });
  });
  it.each(['malformed', 'p::missing', 'missing::model', 'cli::model'])(
    'skips unusable naming candidate %s',
    (configuredId) => {
      expect(
        resolveEffectiveTaskModel({
          ...common,
          kind: 'naming',
          configuredId,
          models: [...common.models, model('missing::model'), model('cli::model')],
        }),
      ).toMatchObject({ status: 'useDefault', model: text });
    },
  );
  it('skips duplicate naming candidates and respects the switch', () => {
    expect(
      resolveEffectiveTaskModel({
        ...common,
        kind: 'naming',
        configuredId: 'p::missing',
        defaultId: 'p::missing',
      }),
    ).toEqual({ status: 'noUsableModel' });
    expect(resolveEffectiveTaskModel({ ...common, kind: 'naming', namingEnabled: false })).toEqual({
      status: 'disabled',
    });
  });
  it('uses only an available painting selection', () => {
    expect(
      resolveEffectiveTaskModel({ ...common, kind: 'painting', configuredId: image.id }),
    ).toMatchObject({ status: 'configured', model: image });
    expect(resolveEffectiveTaskModel({ ...common, kind: 'painting' })).toEqual({
      status: 'noUsableModel',
    });
    expect(
      resolveEffectiveTaskModel({ ...common, kind: 'painting', configuredId: text.id }),
    ).toEqual({ status: 'noUsableModel' });
  });
  it.each(['naming', 'translate', 'painting'] as const)(
    '%s distinguishes loading and errors',
    (kind) => {
      expect(resolveEffectiveTaskModel({ ...common, kind, isLoading: true })).toEqual({
        status: 'loading',
      });
      expect(resolveEffectiveTaskModel({ ...common, kind, hasError: true })).toEqual({
        status: 'loadError',
      });
    },
  );
});
