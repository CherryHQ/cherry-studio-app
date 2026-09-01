import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { ProviderModelRow } from '../ProviderModelRow';

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/eye', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/gift', () => () => null);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/avatar', () => ({ ModelAvatar: () => null }));

const model: Model = {
  capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION],
  id: createUniqueModelId('agent', 'agent/model(free)'),
  isDeprecated: false,
  isEnabled: true,
  isHidden: false,
  modelId: 'agent/model(free)',
  name: 'Display name',
  providerId: 'agent',
  supportsStreaming: true,
};

describe('ProviderModelRow variants', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('replaces the raw model id with decision-useful badges in management', () => {
    act(() => {
      renderer = create(
        <ProviderModelRow model={model} provider={undefined} variant="management" />,
      );
    });

    expect(renderer?.root.findAllByProps({ children: model.modelId })).toHaveLength(0);
    expect(
      renderer?.root
        .findAllByProps({ testID: 'provider-model-badge-free' })
        .filter((node) => node.type === View),
    ).toHaveLength(1);
    expect(
      renderer?.root
        .findAllByProps({ testID: 'provider-model-badge-vision' })
        .filter((node) => node.type === View),
    ).toHaveLength(1);
    expect(
      renderer?.root.findByProps({
        accessibilityLabel:
          'Display name, models.capability.free, models.capability.imageRecognition',
      }),
    ).toBeDefined();
  });

  it('keeps the raw model id in synchronization without management badges', () => {
    act(() => {
      renderer = create(
        <ProviderModelRow model={model} provider={undefined} variant="synchronization" />,
      );
    });

    expect(renderer?.root.findByProps({ children: model.modelId })).toBeDefined();
    expect(renderer?.root.findAllByProps({ testID: 'provider-model-badge-free' })).toHaveLength(0);
    expect(renderer?.root.findAllByProps({ testID: 'provider-model-badge-vision' })).toHaveLength(
      0,
    );
    expect(
      renderer?.root.findByProps({ accessibilityLabel: `Display name, ${model.modelId}` }),
    ).toBeDefined();
  });
});
