import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { ProviderConnectionTestSection } from '../components/ProviderConnectionTestSection';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    OptionPickerBottomSheet: (props: object) => React.createElement('OptionPicker', props),
    Section: Object.assign(Passthrough, {
      Item: (props: object) => React.createElement('Item', props),
      SelectItem: (props: object) => React.createElement('SelectItem', props),
    }),
    Spinner: () => null,
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/ModelPicker', () => ({
  filterModelsByType: (models: unknown) => models,
  ModelPickerDrawer: () => null,
}));
jest.mock('../../../models/hooks/useProviderModelCheck', () => ({
  useProviderModelCheck: ({ apiKeys }: { apiKeys: readonly ApiKeyEntry[] }) => ({
    isChecking: false,
    modelStatus: undefined,
    selectedApiKey: apiKeys.find((entry) => entry.isEnabled),
    selectedModel: { id: 'model', name: 'Model' },
    startCheck: jest.fn(),
  }),
}));

describe('ProviderConnectionTestSection', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  function render(apiKeys: ApiKeyEntry[]) {
    act(() => {
      renderer = create(
        <ProviderConnectionTestSection
          credentials={{ kind: 'api-key', keys: apiKeys, optional: false }}
          disabled={false}
          models={[]}
          providerId="provider"
        />,
      );
    });
    return renderer.root.findAll(
      (node) =>
        typeof node.type === 'string' && node.props.testID === 'provider-connection-test-key',
    );
  }

  it('offers a test-key choice only when more than one key is enabled', () => {
    const a = { id: 'a', isEnabled: true, key: 'sk-first-key' };
    const b = { id: 'b', isEnabled: true, key: 'sk-second-key' };
    expect(render([a, { ...b, isEnabled: false }])).toHaveLength(0);
    expect(renderer.root.findAllByType('OptionPicker' as never)).toHaveLength(0);

    act(() => renderer.unmount());
    expect(render([a, b])).toHaveLength(1);
    expect(renderer.root.findByType('OptionPicker' as never).props.selectedValue).toBe('a');
  });

  it.each([true, false])('shows a service-account check only when ready is %s', (ready) => {
    act(() => {
      renderer = create(
        <ProviderConnectionTestSection
          credentials={{ kind: 'service-account', ready }}
          disabled={false}
          models={[]}
          providerId="vertex"
        />,
      );
    });
    expect(
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'provider-connection-test',
      ),
    ).toHaveLength(ready ? 1 : 0);
    expect(renderer.root.findAllByType('OptionPicker' as never)).toHaveLength(0);
  });
});
