import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderCard } from '../ProviderCard';

jest.mock('heroui-native/utils', () => ({
  cn: (...classes: (false | null | string | undefined)[]) => classes.filter(Boolean).join(' '),
}));
jest.mock('../ProviderAvatar', () => ({ ProviderAvatar: () => null }));

const provider = {
  defaultChatEndpoint: 'anthropic-messages',
  endpointConfigs: {
    'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
    'openai-responses': { baseUrl: 'https://openai.example.com' },
  },
  id: 'custom-provider',
  isEnabled: true,
  name: 'Custom Provider',
} satisfies Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs' | 'id' | 'isEnabled' | 'name'>;

describe('ProviderCard', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('renders provider details in a vertical card', async () => {
    await act(async () => {
      renderer = create(
        <ProviderCard onPress={jest.fn()} provider={provider} statusLabel="Enabled" />,
      );
    });

    const card = renderer?.root.findByProps({ accessibilityRole: 'button' });
    const labels = renderer?.root.findAllByType(Text).map(({ props }) => props.children);

    expect(card?.props.className).toContain('min-h-40 justify-between gap-4 p-4');
    expect(card?.props.accessibilityLabel).toBe(
      'Custom Provider, Enabled, Anthropic Messages, OpenAI Responses',
    );
    expect(labels).toEqual(['Custom Provider', 'Messages · Responses']);
    expect(renderer?.root.findByProps({ testID: 'provider-enabled-dot' })).toBeDefined();
  });
});
