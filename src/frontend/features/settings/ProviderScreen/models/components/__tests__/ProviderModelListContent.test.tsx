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

jest.mock('../ProviderModelRow', () => {
  const React = jest.requireActual('react');

  return {
    ProviderModelRow: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('ProviderModelRow', props, children),
    providerModelRowEstimatedHeight: 50,
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
    act(() => {
      renderer = create(
        <ProviderModelListContent
          isDefaultModel={() => false}
          models={[firstModel, secondModel]}
          provider={undefined}
        />,
      );
    });

    expect(mockListProps.recycleItems).toBe(true);
    // The models themselves: with no separators and no grouped card, a row needs
    // nothing about its neighbours, so there is nothing to wrap them in.
    expect(mockListProps.data).toEqual([firstModel, secondModel]);

    const rows = renderer!.root.findAllByType('ProviderModelRow');
    expect(rows).toHaveLength(2);
    // No control of its own outside a selection: removing is the selection's job.
    expect(rows[0].props).toMatchObject({ model: firstModel, selection: undefined });
    expect(rows[1].props).toMatchObject({ model: secondModel, selection: undefined });
  });

  it('turns the rows into checkboxes while selecting', () => {
    const onToggleModel = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelListContent
          isDefaultModel={(candidate) => candidate === secondModel}
          models={[firstModel, secondModel]}
          provider={undefined}
          selection={{ onToggleModel, selectedIds: new Set([firstModel.id]) }}
        />,
      );
    });

    const rows = renderer!.root.findAllByType('ProviderModelRow');

    expect(rows[0].props.selection).toMatchObject({ isDisabled: false, isSelected: true });
    // The chat default cannot be removed, so it cannot be ticked either.
    expect(rows[1].props.selection).toMatchObject({ isDisabled: true, isSelected: false });

    act(() => rows[0].props.selection.onToggle());

    expect(onToggleModel).toHaveBeenCalledWith(firstModel.id);
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
