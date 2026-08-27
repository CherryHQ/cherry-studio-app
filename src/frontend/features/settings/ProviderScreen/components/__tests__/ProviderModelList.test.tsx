import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelList } from '../ProviderModelList';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');

  function Button({ children, ...props }: { children?: React.ReactNode }) {
    return React.createElement('Button', props, children);
  }
  Button.Label = function ButtonLabel({ children }: { children?: React.ReactNode }) {
    return React.createElement('ButtonLabel', null, children);
  };

  const ContentState = {
    Empty: ({
      className,
      primaryAction,
      secondaryAction,
      title,
    }: {
      className?: string;
      primaryAction?: { children?: React.ReactNode; onPress?: () => void };
      secondaryAction?: { children?: React.ReactNode; onPress?: () => void };
      title: React.ReactNode;
    }) =>
      React.createElement(
        'View',
        { className },
        React.createElement('Text', null, title),
        primaryAction &&
          React.createElement(
            Button,
            { ...primaryAction, variant: 'default' },
            React.createElement(Button.Label, null, primaryAction.children),
          ),
        secondaryAction &&
          React.createElement(
            Button,
            { ...secondaryAction, variant: 'secondary' },
            React.createElement(Button.Label, null, secondaryAction.children),
          ),
      ),
  };

  return { Button, ContentState };
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

  it('centers the empty message above pull and add actions', () => {
    const onAdd = jest.fn();
    const onPull = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelList
          addAction={{ onPress: onAdd }}
          isDefaultModel={() => false}
          isLoading={false}
          models={[]}
          provider={undefined}
          pullAction={{ onPress: onPull }}
        />,
      );
    });

    const emptyLayout = renderer?.root.findByProps({
      className: 'flex-1 px-6 pb-24',
    });
    const buttons = renderer?.root.findAllByType('Button') ?? [];

    expect(emptyLayout).toBeDefined();
    expect(renderer?.root.findByType('Text').props.children).toBe('settings.provider.models.empty');
    expect(buttons.map((button) => button.props.variant)).toEqual(['default', 'secondary']);
    expect(
      renderer?.root.findAllByType('ButtonLabel').map((label) => label.props.children),
    ).toEqual(['settings.provider.models.emptyAction', 'settings.provider.models.addSubmit']);

    act(() => {
      buttons[0]?.props.onPress();
      buttons[1]?.props.onPress();
    });
    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows a search empty state without provider actions for a filtered list', () => {
    act(() => {
      renderer = create(
        <ProviderModelList
          addAction={{ onPress: jest.fn() }}
          isDefaultModel={() => false}
          isFiltered
          isLoading={false}
          models={[]}
          provider={undefined}
          pullAction={{ onPress: jest.fn() }}
        />,
      );
    });

    expect(renderer?.root.findByType('Text').props.children).toBe(
      'settings.provider.models.search.empty',
    );
    expect(renderer?.root.findAllByType('Button')).toHaveLength(0);
  });
});
