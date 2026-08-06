import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelListContent } from '../ProviderModelListContent';

type MockLegendListProps = {
  data: unknown[];
  extraData: unknown;
  keyExtractor: (item: unknown, index: number) => string;
  recycleItems?: boolean;
  renderItem: (props: { extraData: unknown; index: number; item: unknown }) => ReactNode;
};

let mockListProps: Partial<MockLegendListProps> = {};

jest.mock('@legendapp/list/react-native', () => ({
  LegendList: (props: MockLegendListProps) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    mockListProps = props;

    return React.createElement(
      View,
      { testID: 'legend-list' },
      props.data.map((item: unknown, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ extraData: props.extraData, index, item }),
        ),
      ),
    );
  },
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  return {
    Button: (props: object) => React.createElement('Button', props),
  };
});

jest.mock('lucide-uniwind/png', () => ({ MinusIcon: () => null }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../ProviderModelRow', () => {
  const React = jest.requireActual('react');

  return {
    ProviderModelRow: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('ProviderModelRow', props, children),
    providerModelRowEstimatedHeight: 48,
  };
});

const firstModel = model('alpha');
const secondModel = model('beta');

describe('ProviderModelListContent', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockListProps = {};
  });

  it('renders one flat recycled list containing only model rows', () => {
    const onRemoveModel = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelListContent
          isDefaultModel={() => false}
          models={[firstModel, secondModel]}
          provider={undefined}
          removingIds={new Set()}
          onRemoveModel={onRemoveModel}
        />,
      );
    });

    expect(mockListProps.recycleItems).toBe(true);
    expect(mockListProps.data).toEqual([
      {
        isFirst: true,
        isLast: false,
        itemKey: `model:${firstModel.id}`,
        model: firstModel,
        previousItemKey: undefined,
      },
      {
        isFirst: false,
        isLast: true,
        itemKey: `model:${secondModel.id}`,
        model: secondModel,
        previousItemKey: `model:${firstModel.id}`,
      },
    ]);

    const rows = renderer!.root.findAllByType('ProviderModelRow');
    expect(rows).toHaveLength(2);
    expect(rows[0].props).toMatchObject({ isFirst: true, isLast: false, model: firstModel });
    expect(rows[1].props).toMatchObject({ isFirst: false, isLast: true, model: secondModel });

    act(() => renderer!.root.findAllByType('Button')[1].props.onPress());
    expect(onRemoveModel).toHaveBeenCalledWith(secondModel);
  });
});

function model(modelId: string): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('provider', modelId),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId: 'provider',
    supportsStreaming: true,
  };
}
