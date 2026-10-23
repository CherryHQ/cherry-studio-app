import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaneChromeProvider } from '@/frontend/appShell/layout';

import { RouteHeader } from './RouteHeader';
import { RouteHeaderProvider } from './RouteHeaderProvider';

let mockNavigationIndex = 0;

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');

  return {
    Stack: {
      Screen: (props: { options: Record<string, unknown> }) =>
        React.createElement('StackScreen', props),
    },
    useNavigation: () => ({ dispatch: jest.fn() }),
    useRouter: () => ({ back: jest.fn() }),
  };
});

jest.mock('expo-router/react-navigation', () => ({
  DrawerActions: { openDrawer: () => ({ type: 'OPEN_DRAWER' }) },
  useNavigationState: (selector: (state: { index: number }) => unknown) =>
    selector({ index: mockNavigationIndex }),
}));

jest.mock('@cherrystudio/app-icons/icons/arrow-left', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/menu', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/x', () => () => null);

jest.mock('../components/HeaderAction', () => {
  const React = jest.requireActual('react');

  return {
    HeaderAction: ({ action }: { action: unknown }) =>
      React.createElement('HeaderAction', { action }),
  };
});

jest.mock('../components/HeaderChrome', () =>
  jest.requireActual('../components/HeaderChrome/HeaderChrome.android'),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count: number }) => (values ? `${key}:${values.count}` : key),
  }),
}));

describe('RouteHeader.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    mockNavigationIndex = 0;
  });

  it('uses the route root action and switches child screens to back', async () => {
    await renderRouteHeader(<RouteHeader title="Root" />, 'drawer');

    expect(getLeadingAction().accessibilityLabel).toBe('navigation.openMenu');

    mockNavigationIndex = 1;
    await renderRouteHeader(<RouteHeader title="Child" />, 'drawer');

    expect(getLeadingAction().accessibilityLabel).toBe('navigation.back');

    await renderRouteHeader(<RouteHeader title="Viewer" />, 'close');

    expect(getLeadingAction().accessibilityLabel).toBe('common.close');
  });

  it('clears custom title and right actions when later states omit them', async () => {
    await renderRouteHeader(
      <RouteHeader
        rightActions={[{ key: 'edit', label: 'Edit', onPress: jest.fn(), type: 'label' }]}
        title="Config"
        titleElement={<Text>Tabs</Text>}
      />,
    );

    expect(getOptions().headerRight).toEqual(expect.any(Function));
    expect(getOptions().headerTitle).toEqual(expect.any(Function));
    expect(getOptions().headerTitleAlign).toBe('center');
    expect(getOptions().title).toBe('');

    await renderRouteHeader(
      <RouteHeader
        rightActions={[{ key: 'save', label: 'Save', onPress: jest.fn(), type: 'label' }]}
        title="Config"
      />,
    );

    expect(getOptions().headerRight).toEqual(expect.any(Function));
    expect(getOptions().headerTitle).toBeUndefined();
    expect(getOptions().headerTitleAlign).toBe('center');
    expect(getOptions().title).toBe('Config');

    await renderRouteHeader(<RouteHeader title="Config" />);

    expect(getOptions().headerRight).toBeUndefined();
    expect(getOptions().headerTitle).toBeUndefined();
    expect(getOptions().title).toBe('Config');
  });

  it('renders a toolbar menu action with its declared items', async () => {
    const menuItems = [{ id: 'add', label: 'Add model', onPress: jest.fn() }];
    const MoreIcon = () => null;

    await renderRouteHeader(
      <RouteHeader
        rightActions={[
          {
            accessibilityLabel: 'More',
            icon: MoreIcon,
            items: menuItems,
            key: 'more',
            type: 'menu',
          },
        ]}
        title="Models"
      />,
    );

    const headerRight = getOptions().headerRight as () => ReactElement<{
      actions: readonly { items?: readonly unknown[] }[];
    }>;
    expect(headerRight().props.actions[0]?.items).toBe(menuItems);
  });

  it('replaces page chrome with one selection exit and restores it when selection ends', async () => {
    const exitSelection = jest.fn();
    const pageProps = {
      rightActions: [
        { key: 'create', label: 'Create', onPress: jest.fn(), type: 'label' as const },
      ],
      title: 'Models',
      titleElement: <Text>Tabs</Text>,
    };

    await renderRouteHeader(
      <RouteHeader {...pageProps} selection={{ onExit: exitSelection, selectedCount: 2 }} />,
      'drawer',
    );

    expect(getOptions().title).toBe('common.selection.count:2');
    expect(getOptions().headerTitle).toBeUndefined();
    expect(getOptions().headerRight).toBeUndefined();
    expect(getLeadingAction().accessibilityLabel).toBe('common.cancel');
    getLeadingAction().onPress();
    expect(exitSelection).toHaveBeenCalledTimes(1);

    await renderRouteHeader(<RouteHeader {...pageProps} />, 'drawer');

    expect(getLeadingAction().accessibilityLabel).toBe('navigation.openMenu');
    expect(getOptions().headerTitle).toEqual(expect.any(Function));
    expect(getOptions().headerRight).toEqual(expect.any(Function));
  });

  it('renders inline in a pane, leading with the pane exit unless the page declares a back step', async () => {
    const paneExit = {
      accessibilityLabel: 'common.close',
      icon: () => null,
      key: 'pane-exit',
      onPress: jest.fn(),
      type: 'icon' as const,
    };
    const folderUp = jest.fn();
    const inPane = (element: ReactElement) => (
      <PaneChromeProvider leadingAction={paneExit}>{element}</PaneChromeProvider>
    );

    await renderRouteHeader(inPane(<RouteHeader title="Files" />), 'drawer');

    expect(renderer!.root.findAllByType('StackScreen')).toHaveLength(0);
    expect(getInlineActions()[0]).toBe(paneExit);

    await renderRouteHeader(inPane(<RouteHeader onBack={folderUp} title="Folder" />), 'drawer');

    const back = getInlineActions()[0]!;
    expect(back.accessibilityLabel).toBe('navigation.back');
    back.onPress();
    expect(folderUp).toHaveBeenCalledTimes(1);
  });

  function getInlineActions() {
    return renderer!.root
      .findAllByType('HeaderAction' as never)
      .map(
        (node) =>
          (node.props as { action: { accessibilityLabel?: string; onPress: () => void } }).action,
      );
  }

  async function renderRouteHeader(
    element: ReactElement,
    rootAction: 'back' | 'close' | 'drawer' = 'back',
  ) {
    await act(async () => {
      const tree = <RouteHeaderProvider rootAction={rootAction}>{element}</RouteHeaderProvider>;

      if (renderer) {
        renderer.update(tree);
      } else {
        renderer = create(tree);
      }
    });
  }

  function getLeadingAction() {
    const headerLeft = getOptions().headerLeft as () => ReactElement<{
      actions: readonly { accessibilityLabel?: string; onPress: () => void }[];
    }>;
    const action = headerLeft().props.actions[0];

    if (!action) {
      throw new Error('RouteHeader leading action was not rendered.');
    }

    return action;
  }

  function getOptions(): Record<string, unknown> {
    if (!renderer) {
      throw new Error('RouteHeader renderer was not created.');
    }
    return renderer.root.findByType('StackScreen').props.options;
  }
});
