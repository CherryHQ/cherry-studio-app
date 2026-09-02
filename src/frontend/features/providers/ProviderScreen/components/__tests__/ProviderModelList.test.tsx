import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelList } from '../ProviderModelList';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  const ContentState = {
    Empty: ({ className, title }: { className?: string; title: React.ReactNode }) =>
      React.createElement('View', { className }, React.createElement('Text', null, title)),
  };

  return { ContentState };
});

jest.mock('../../models/components/ProviderModelListContent', () => ({
  ProviderModelListContent: ({ ListEmptyComponent }: { ListEmptyComponent?: ReactElement }) =>
    ListEmptyComponent ?? null,
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

  it('shows the empty message without an inline action', () => {
    act(() => {
      renderer = create(<ProviderModelList isLoading={false} models={[]} provider={undefined} />);
    });

    expect(renderer?.root.findByType('Text').props.children).toBe('settings.provider.models.empty');
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
