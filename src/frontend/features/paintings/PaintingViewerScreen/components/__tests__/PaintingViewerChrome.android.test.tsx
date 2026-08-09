import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingViewerChrome } from '../PaintingViewerChrome.android';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const component =
    (type: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(type, props, children);

  return {
    DropdownMenu: {
      Content: component('DropdownMenu.Content'),
      Item: component('DropdownMenu.Item'),
      ItemTitle: component('DropdownMenu.ItemTitle'),
      Root: component('DropdownMenu.Root'),
      Trigger: component('DropdownMenu.Trigger'),
    },
  };
});

jest.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: { headerRight: () => React.ReactNode } }) =>
      options.headerRight(),
  },
}));

jest.mock('lucide-uniwind/png', () => ({
  DownloadIcon: () => null,
  EllipsisIcon: () => null,
  PencilIcon: () => null,
  ProportionsIcon: () => null,
  XIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@/frontend/components/headers/components/HeaderIconButton', () => ({
  HeaderIconButton: () => null,
}));

describe('PaintingViewerChrome.android', () => {
  let renderer: ReactTestRenderer | undefined;
  const onDelete = jest.fn();
  const onViewConversation = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      renderer = create(
        <PaintingViewerChrome
          aspectRatios={['1:1', '16:9']}
          onClose={jest.fn()}
          onDelete={onDelete}
          onDownload={jest.fn()}
          onEdit={jest.fn()}
          onResizeSelect={jest.fn()}
          onViewConversation={onViewConversation}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('places view conversation before delete and dispatches both actions', () => {
    const items = renderer!.root.findAllByType('DropdownMenu.Item');
    const titles = renderer!.root.findAllByType('DropdownMenu.ItemTitle');

    expect(titles.slice(0, 2).map((title) => title.props.children)).toEqual([
      'painting.viewer.viewConversation',
      'painting.viewer.delete',
    ]);

    items[0].props.onSelect();
    items[1].props.onSelect();

    expect(onViewConversation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
