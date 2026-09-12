import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelList } from '../ProviderModelList';

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

  return { ContentState, OptionPickerBottomSheet: () => null };
});

jest.mock('../../../models/components/ProviderModelListContent', () => ({
  ProviderModelListContent: ({ ListEmptyComponent }: { ListEmptyComponent?: ReactElement }) =>
    ListEmptyComponent ?? null,
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
});
