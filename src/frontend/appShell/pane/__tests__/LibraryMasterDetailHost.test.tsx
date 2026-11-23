import { type ReactNode, useLayoutEffect } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { RouteHeader } from '@/frontend/appShell/header';

import { LibraryMasterDetailHost } from '../LibraryMasterDetailHost';
import { useLibraryMasterDetail } from '../state';

let mockShellMode: 'compact-dock' | 'vertical-rail' | 'wide-rail' = 'wide-rail';
let mockCollapsed = false;
const mockToggleCollapsed = jest.fn(() => {
  mockCollapsed = !mockCollapsed;
});
const mockReportWidth = jest.fn();

jest.mock('@cherrystudio/app-icons/icons/folder-open', () => () => null);
jest.mock('@/frontend/appShell/icons/SidebarExpandIcon', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const Node = ({ children }: { children?: ReactNode; testID?: string }) =>
    createElement('View', null, children);
  return {
    ContentState: {
      Empty: ({ title }: { title: string }) =>
        createElement(Node, { testID: 'empty-preview' }, title),
    },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaInsetsContext: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ bottom: 20, left: 0, right: 0, top: 24 }),
}));
jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => ['#ffffff', '#f5f5f5', '#e5e5e5'],
}));
jest.mock('@/frontend/appShell/layout', () => {
  const { createContext, use } = jest.requireActual('react');
  const Ctx = createContext(null);
  return {
    isAcross: () => false,
    PaneChromeProvider: ({ children, ...props }: { children: unknown }) => (
      <Ctx value={props}>{children}</Ctx>
    ),
    useFoldRegion: () => null,
    usePaneChrome: () => use(Ctx),
  };
});
jest.mock('@/frontend/appShell/header', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { usePaneChrome } = jest.requireMock<typeof import('@/frontend/appShell/layout')>(
    '@/frontend/appShell/layout',
  );
  const Node = ({ children }: { children?: ReactNode; onPress?: () => void; testID?: string }) =>
    createElement('View', null, children);
  return {
    RouteHeader: ({ title }: { title: string }) => {
      const chrome = usePaneChrome();
      const leading = chrome?.leadingAction;
      const header = chrome?.headerAction;
      return createElement(
        Node,
        null,
        createElement(Node, { testID: `header-align-${chrome?.titleAlign ?? 'center'}` }, title),
        leading && 'onPress' in leading
          ? createElement(Node, {
              onPress: leading.onPress,
              testID: leading.testID ?? 'header-has-leading',
            })
          : null,
        header && 'onPress' in header
          ? createElement(Node, {
              onPress: header.onPress,
              testID: header.testID,
            })
          : null,
      );
    },
  };
});
jest.mock('@/frontend/appShell/navigationShell/state', () => ({
  FILES_MASTER_WIDTH: 288,
  WIDE_RAIL_WIDTH: 60,
  useNavigationShell: () => ({
    isFileListCollapsed: mockCollapsed,
    shellMode: mockShellMode,
    toggleFileListCollapsed: mockToggleCollapsed,
  }),
  useReportMiddleColumnWidth: (_source: string, width: number) => mockReportWidth(width),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let latestState: ReturnType<typeof useLibraryMasterDetail> = null;
function MockLibrary() {
  const state = useLibraryMasterDetail();
  useLayoutEffect(() => {
    latestState = state;
  });
  return (
    <View>
      <RouteHeader title="Files" />
      <Text testID="library-pane">library</Text>
    </View>
  );
}

describe('LibraryMasterDetailHost', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShellMode = 'wide-rail';
    mockCollapsed = false;
    latestState = null;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('renders only library in compact mode without reporting split width', () => {
    mockShellMode = 'compact-dock';
    act(() => {
      renderer = create(
        <LibraryMasterDetailHost
          library={<MockLibrary />}
          renderPreview={(id) => (
            <View testID={`preview-${id}`}>
              <RouteHeader title={id} />
              <Text>{id}</Text>
            </View>
          )}
        />,
      );
    });

    expect(latestState?.isMasterDetail).toBe(false);
    expect(mockReportWidth).toHaveBeenCalledWith(0);
    expect(renderer.root.findAllByProps({ testID: 'files-master-detail' })).toHaveLength(0);
  });

  it('renders 288pt Master + right Preview without back button in wide-rail mode', () => {
    act(() => {
      renderer = create(
        <LibraryMasterDetailHost
          library={<MockLibrary />}
          renderPreview={(id) => (
            <View testID={`preview-${id}`}>
              <RouteHeader title={id} />
              <Text>{id}</Text>
            </View>
          )}
        />,
      );
    });

    expect(latestState?.isMasterDetail).toBe(true);
    expect(mockReportWidth).toHaveBeenCalledWith(288);
    expect(renderer.root.findByProps({ testID: 'files-master-column' }).props.style.width).toBe(
      288,
    );
    expect(renderer.root.findAllByProps({ testID: 'header-has-leading' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'header-align-left' })).toHaveLength(1);
    expect(renderer.root.findByProps({ testID: 'files-master-toggle' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'empty-preview' })).toBeTruthy();

    act(() => {
      latestState?.selectFile('file-42');
    });
    expect(renderer.root.findByProps({ testID: 'preview-file-42' })).toBeTruthy();

    act(() => {
      renderer.root.findByProps({ testID: 'files-master-toggle' }).props.onPress();
    });
    expect(mockToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
