import { createUniqueModelId, type Model } from '@cherrystudio/universal/data/types/model';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelPullList } from '../ProviderModelPullList';

type MockLegendListProps = {
  data: unknown[];
  drawDistance?: number;
  extraData: unknown;
  keyExtractor: (item: unknown, index: number) => string;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
  ListHeaderComponent?: ReactNode;
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
      props.ListHeaderComponent,
      props.data.length === 0 ? props.ListEmptyComponent : null,
      props.data.map((item: unknown, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ extraData: props.extraData, index, item }),
        ),
      ),
      props.ListFooterComponent,
    );
  },
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  function Section({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(View, props, children);
  }
  Section.Header = function SectionHeader({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(View, props, children);
  };

  return { Section };
});

jest.mock('../ProviderModelRow', () => {
  const React = jest.requireActual('react');

  return {
    ProviderModelRow: (props: object) => React.createElement('ProviderModelRow', props),
    providerModelRowEstimatedHeight: 42,
  };
});

jest.mock('../ProviderModelSearchField', () => {
  const React = jest.requireActual('react');
  return {
    ProviderModelSearchField: (props: object) =>
      React.createElement('ProviderModelSearchField', props),
  };
});

jest.mock('../ProviderModelTypeFilterBar', () => {
  const React = jest.requireActual('react');
  return {
    ProviderModelTypeFilterBar: (props: object) =>
      React.createElement('ProviderModelTypeFilterBar', props),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const addedModel = model('added');
const missingModel = model('missing');

describe('ProviderModelPullList', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockListProps = {};
  });

  it('renders both pull sections through one recycled virtual list', () => {
    const isSelected = jest.fn((section: 'added' | 'missing') => section === 'added');
    const onToggleAll = jest.fn();
    const onToggleModel = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelPullList
          isDisabled={false}
          isSelected={isSelected}
          preview={{ added: [addedModel], missing: [missingModel] }}
          provider={undefined}
          searchFieldPlacement="inline"
          onToggleAll={onToggleAll}
          onToggleModel={onToggleModel}
        />,
      );
    });

    expect(mockListProps.recycleItems).toBe(true);
    expect(mockListProps.drawDistance).toBe(320);
    expect(mockListProps.data).toEqual([
      expect.objectContaining({ key: 'section:added', type: 'section' }),
      expect.objectContaining({ key: `model:added:${addedModel.id}`, type: 'model' }),
      expect.objectContaining({ key: 'section:missing', type: 'section' }),
      expect.objectContaining({ key: `model:missing:${missingModel.id}`, type: 'model' }),
    ]);

    const rows = renderer!.root.findAllByType('ProviderModelRow');
    expect(rows[0].props).toMatchObject({ model: addedModel, tone: 'default' });
    expect(rows[0].props.selection).toMatchObject({ isDisabled: false, isSelected: true });
    expect(rows[1].props).toMatchObject({ model: missingModel, tone: 'struck' });
    expect(rows[1].props.selection).toMatchObject({ isDisabled: false, isSelected: false });

    act(() => rows[1].props.selection.onToggle());
    expect(onToggleModel).toHaveBeenCalledWith('missing', missingModel.id);
  });

  it('keeps filtering state local and exposes only displayed ids to screen chrome', () => {
    let displayedIds: readonly string[] = [];

    act(() => {
      renderer = create(
        <ProviderModelPullList
          isDisabled={false}
          isSelected={() => false}
          preview={{ added: [addedModel], missing: [missingModel] }}
          provider={undefined}
          searchFieldPlacement="inline"
          onToggleAll={jest.fn()}
          onToggleModel={jest.fn()}
          renderAccessory={(state) => {
            displayedIds = state.displayedIds;
            return null;
          }}
        />,
      );
    });

    expect(displayedIds).toEqual([addedModel.id, missingModel.id]);

    const searchField = renderer!.root.findByType('ProviderModelSearchField');
    act(() => searchField.props.setSearchText('missing'));

    expect(displayedIds).toEqual([missingModel.id]);
    expect(mockListProps.data).toEqual([
      expect.objectContaining({ key: 'section:missing' }),
      expect.objectContaining({ key: `model:missing:${missingModel.id}` }),
    ]);
  });

  it('selects only models in the pressed section', () => {
    const onToggleAll = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelPullList
          isDisabled={false}
          isSelected={() => false}
          preview={{ added: [addedModel], missing: [missingModel] }}
          provider={undefined}
          searchFieldPlacement="inline"
          onToggleAll={onToggleAll}
          onToggleModel={jest.fn()}
        />,
      );
    });

    const selectAllButtons = renderer!.root
      .findAllByProps({
        accessibilityLabel: 'settings.provider.models.selection.selectAll',
      })
      .filter((node) => typeof node.props.onPress === 'function');
    act(() => selectAllButtons[1].props.onPress());

    expect(onToggleAll).toHaveBeenCalledWith('missing', [missingModel.id]);
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
