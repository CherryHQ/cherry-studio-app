import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Model } from '@/shared/data/types/model';

import { ProviderModelListContent } from '../../../models/components/ProviderModelListContent';
import type { useProviderModelManagement } from '../../../models/hooks/useProviderModelManagement';
import { ProviderModelList } from '../ProviderModelList';

const mockReorder = jest.fn();
const mockToastShow = jest.fn();
const mockListContentProps: { canReorder?: boolean; ListEmptyComponent?: ReactElement }[] = [];

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  const ContentState = {
    Empty: ({
      className,
      primaryAction,
      secondaryAction,
      title,
    }: {
      className?: string;
      primaryAction?: { children: React.ReactNode; onPress: () => void };
      secondaryAction?: { children: React.ReactNode; onPress: () => void };
      title: React.ReactNode;
    }) =>
      React.createElement(
        'View',
        { className, primaryAction, secondaryAction, testID: 'content-state-empty' },
        React.createElement('Text', null, title),
      ),
  };

  return {
    ContentState,
    OptionPickerBottomSheet: () => null,
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

jest.mock('@/frontend/data', () => ({
  useReorder: () => ({ isPending: false, reorder: mockReorder, reorderIndex: jest.fn() }),
}));

jest.mock('../../../models/components/ProviderModelListContent', () => ({
  ProviderModelListContent: (props: {
    canReorder?: boolean;
    ListEmptyComponent?: ReactElement;
  }) => {
    mockListContentProps.push(props);
    return props.ListEmptyComponent ?? null;
  },
}));

jest.mock('../../../models/hooks/useProviderModelEndpointUpdate', () => ({
  useProviderModelEndpointUpdate: () => ({
    updateEndpoint: jest.fn(),
    updatingModelId: undefined,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ProviderModelList empty state', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockListContentProps.length = 0;
    mockReorder.mockReset();
    mockToastShow.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('makes model sync primary and manual creation secondary when the provider is empty', () => {
    const onAddModelManually = jest.fn();
    const onPullModels = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelList
          isLoading={false}
          models={[]}
          onAddModelManually={onAddModelManually}
          onPullModels={onPullModels}
          provider={undefined}
        />,
      );
    });

    expect(renderer?.root.findByType('Text').props.children).toBe('settings.provider.models.empty');
    const emptyState = renderer?.root.findByProps({ testID: 'content-state-empty' });

    expect(emptyState?.props.primaryAction).toEqual({
      children: 'settings.provider.models.emptyAction',
      onPress: onPullModels,
    });
    expect(emptyState?.props.secondaryAction).toEqual({
      children: 'settings.provider.models.addTitle',
      onPress: onAddModelManually,
    });
  });

  it('shows a search empty state without provider actions for a filtered list', () => {
    act(() => {
      renderer = create(
        <ProviderModelList isFiltered isLoading={false} models={[]} provider={undefined} />,
      );
    });

    expect(renderer?.root.findByType('Text').props.children).toBe(
      'settings.provider.models.search.empty',
    );
  });

  it('persists a purpose-tab drag in the full provider order, keeping other models in place', () => {
    const [a, image, b] = ['a', 'image', 'b'].map(
      (name): Model => ({
        capabilities: [],
        id: `provider::${name}`,
        isDeprecated: false,
        isEnabled: true,
        isHidden: false,
        modelId: name,
        name,
        providerId: 'provider',
        supportsStreaming: true,
      }),
    );
    const full = [a, image, b];
    act(() => {
      renderer = create(
        <ProviderModelList
          models={full}
          visibleModels={[a, b]}
          provider={undefined}
          isLoading={false}
        />,
      );
    });
    const content = renderer!.root.findByType(ProviderModelListContent);
    expect(content.props.models).toEqual([a, b]);
    act(() => {
      content.props.onReorderModels([b, a]);
    });
    expect(mockReorder).toHaveBeenCalledWith(full, [b, image, a]);
  });

  it('keeps reordering active on purpose tabs and disables it only while searching', () => {
    const management = {
      isDeleting: false,
      isSelecting: false,
    } as ReturnType<typeof useProviderModelManagement>;

    act(() => {
      renderer = create(
        <ProviderModelList
          isFiltered
          isLoading={false}
          isSearchActive={false}
          management={management}
          models={[]}
          provider={undefined}
        />,
      );
    });
    expect(mockListContentProps.at(-1)?.canReorder).toBe(true);

    act(() => {
      renderer?.update(
        <ProviderModelList
          isFiltered
          isLoading={false}
          isSearchActive
          management={management}
          models={[]}
          provider={undefined}
        />,
      );
    });
    expect(mockListContentProps.at(-1)?.canReorder).toBe(false);
  });
});
