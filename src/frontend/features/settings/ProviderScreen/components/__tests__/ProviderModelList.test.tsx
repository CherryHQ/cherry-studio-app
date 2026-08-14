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

  return { Button };
});

jest.mock('../../models/components/ProviderModelListContent', () => ({
  ProviderModelListContent: ({ ListEmptyComponent }: { ListEmptyComponent?: ReactElement }) =>
    ListEmptyComponent ?? null,
}));

jest.mock('../../models/components/ProviderModelSearchField', () => ({
  ProviderModelSearchField: () => null,
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
      className: 'flex-1 items-center justify-center gap-4 px-6 pb-24',
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
});
