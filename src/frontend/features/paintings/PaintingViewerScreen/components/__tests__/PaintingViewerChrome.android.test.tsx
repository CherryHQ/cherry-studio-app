import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingViewerChrome } from '../PaintingViewerChrome.android';

type MenuProps = {
  actions: { id: string; image?: unknown; title: string }[];
  onPressAction: (event: { nativeEvent: { event: string } }) => void;
};

const mockMenus: MenuProps[] = [];

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: (props: MenuProps) => {
    mockMenus.push(props);
    return null;
  },
}));

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
    mockMenus.length = 0;
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
    const moreMenu = mockMenus[0];

    expect(moreMenu.actions.map((action) => action.id)).toEqual(['view-conversation', 'delete']);
    expect(moreMenu.actions[0].image).toBeTruthy();

    moreMenu.onPressAction({ nativeEvent: { event: 'view-conversation' } });
    moreMenu.onPressAction({ nativeEvent: { event: 'delete' } });

    expect(onViewConversation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
