import type { ReactElement, ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';
import { DataApiError, ErrorCode } from '@/shared/data/api/types';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';
import { McpServerScreen } from '../McpServerScreen';

type HeaderAction = {
  disabled?: boolean;
  element?: ReactElement;
  key: string;
  label?: string;
  onPress?: () => void;
};
type McpTabsElementProps = {
  onTabChange: (tab: 'configuration' | 'tools') => void;
  tab: 'configuration' | 'tools';
};
type HeaderProps = {
  rightActions?: readonly HeaderAction[];
  title?: string;
  titleElement?: ReactElement<McpTabsElementProps>;
};

let mockHeaderProps: HeaderProps = {};
let mockIsCreating = false;
let mockIsDeleting = false;
let mockIsUpdating = false;
let mockServer: StreamableHttpMcpServer | undefined;
let mockServerError: unknown;
let mockServerId = 'new';
let mockServerLoading = false;
const mockCreateServer = jest.fn();
const mockDeleteServer = jest.fn();
const mockGetServerInfo = jest.fn();
const mockRequestConfirm = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterReplace = jest.fn();
const mockServerRefetch = jest.fn();
const mockToastShow = jest.fn();
const mockUpdateServer = jest.fn();
const backend = {
  mcp: { getServerInfo: mockGetServerInfo },
} as unknown as Backend;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ serverId: mockServerId }),
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace }),
}));

jest.mock('heroui-native/input', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Input: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-native-keyboard-controller', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    KeyboardAwareScrollView: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
  };
});

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: (props: HeaderProps) => {
    mockHeaderProps = props;
    return null;
  },
}));

jest.mock('@/frontend/components/confirmDialog', () => ({
  useConfirmDialog: () => ({ confirmDialog: null, requestConfirm: mockRequestConfirm }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ error: jest.fn() }) },
}));

jest.mock('@/frontend/hooks/mcp/useMcpServers', () => ({
  useMcpServerApiById: () => ({
    error: mockServerError,
    isLoading: mockServerLoading,
    refetch: mockServerRefetch,
    server: mockServer,
  }),
  useMcpServerMutations: () => ({
    createServer: mockCreateServer,
    deleteServer: mockDeleteServer,
    isCreating: mockIsCreating,
    isDeleting: mockIsDeleting,
    isUpdating: mockIsUpdating,
    updateServer: mockUpdateServer,
  }),
}));

jest.mock('@/frontend/features/settings/components/SettingsDialogActionButton', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return {
    SettingsDialogActionButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <MockPressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} />
    ),
  };
});

jest.mock('../components/McpHeadersEditor', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { McpHeadersEditor: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('../components/McpServerChrome/McpServerChrome', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    McpServerChrome: (props: Record<string, unknown>) => (
      <MockView {...props} testID="mcp-server-chrome" />
    ),
  };
});

jest.mock('../components/McpServerTabs/McpServerTabs', () => ({
  McpServerTabs: () => null,
}));

jest.mock('../components/McpToolsSection', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    McpToolsSection: (props: Record<string, unknown>) => (
      <MockView {...props} testID="mcp-tools-section" />
    ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { line?: number }) =>
      options?.line
        ? `${key}:${options.line}`
        : ({
            'common.edit': 'Edit',
            'common.save': 'Save',
            'settings.mcp.defaultName': 'MCP Server',
            'settings.mcp.detail.loadFailed': 'Failed to load this MCP server.',
            'settings.mcp.detail.loading': 'Loading MCP server...',
            'settings.mcp.detail.notFound': 'This MCP server no longer exists.',
            'settings.mcp.retry': 'Retry',
            'settings.mcp.tabs.configuration': 'Config',
          }[key] ?? key),
  }),
}));

function makeServer(overrides: Partial<StreamableHttpMcpServer> = {}): StreamableHttpMcpServer {
  return {
    baseUrl: 'https://example.com/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools: [],
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'Server',
    type: 'streamableHttp',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('McpServerScreen tabs', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHeaderProps = {};
    mockIsCreating = false;
    mockIsDeleting = false;
    mockIsUpdating = false;
    mockServer = undefined;
    mockServerError = undefined;
    mockServerId = 'new';
    mockServerLoading = false;
    mockGetServerInfo.mockResolvedValue({
      instructions: 'Remote instructions',
      name: 'remote-name',
      title: 'Remote title',
      version: '1.0.0',
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  async function render() {
    await act(async () => {
      renderer = create(renderSubject());
    });

    if (!renderer) {
      throw new Error('McpServerScreen test renderer was not created.');
    }

    return renderer;
  }

  function renderSubject() {
    return (
      <BackendProvider backend={backend}>
        <McpServerScreen />
      </BackendProvider>
    );
  }

  it('shows only the Config title before the server is saved', async () => {
    const tree = await render();

    expect(mockHeaderProps.title).toBe('Config');
    expect(mockHeaderProps.titleElement).toBeUndefined();
    expect(mockHeaderProps.rightActions?.map((action) => action.key)).toEqual(['save']);
    expect(mockHeaderProps.rightActions?.[0]?.label).toBe('Save');
    expect(tree.root.findAllByProps({ testID: 'mcp-tools-section' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'mcp-server-chrome' })).toHaveLength(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.name',
      ),
    ).toHaveLength(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.description',
      ),
    ).toHaveLength(0);
  });

  it('does not mount the editor or operations while loading an existing server', async () => {
    mockServerId = 'server-1';
    mockServerLoading = true;
    const tree = await render();

    expect(mockHeaderProps.rightActions).toBeUndefined();
    expect(tree.root.findAllByProps({ testID: 'mcp-server-chrome' })).toHaveLength(0);
    expect(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.name',
      ),
    ).toHaveLength(0);
    expect(
      tree.root.findAll((node) => node.props.children === 'Loading MCP server...'),
    ).not.toHaveLength(0);
  });

  it('shows a retriable detail error without editor operations', async () => {
    mockServerId = 'server-1';
    mockServerError = new Error('database unavailable');
    const tree = await render();

    expect(mockHeaderProps.rightActions).toBeUndefined();
    expect(tree.root.findAllByProps({ testID: 'mcp-server-chrome' })).toHaveLength(0);
    tree.root.findByProps({ accessibilityLabel: 'Retry' }).props.onPress();
    expect(mockServerRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows not-found without retry or editor operations', async () => {
    mockServerId = 'server-1';
    mockServerError = new DataApiError(ErrorCode.NOT_FOUND, 'missing');
    const tree = await render();

    expect(mockHeaderProps.rightActions).toBeUndefined();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Retry' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'mcp-server-chrome' })).toHaveLength(0);
    expect(
      tree.root.findAll((node) => node.props.children === 'This MCP server no longer exists.'),
    ).not.toHaveLength(0);
  });

  it('rejects structurally invalid URLs before server discovery', async () => {
    const tree = await render();
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockGetServerInfo).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.mcp.fields.baseUrlInvalid',
      variant: 'danger',
    });
  });

  it('reports the malformed header line before server discovery', async () => {
    const tree = await render();
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );
    const headerInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        typeof node.props.onChangeText === 'function' &&
        node.props.placeholder === undefined &&
        node.props.value === '',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://example.com/mcp');
      headerInput.props.onChangeText('Authorization=Bearer token\nmalformed');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockGetServerInfo).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.mcp.headers.invalidLine:2',
      variant: 'danger',
    });
  });

  it('uses the remote server title as the persisted name when creating a server', async () => {
    const tree = await render();
    mockCreateServer.mockResolvedValue(makeServer({ name: 'Remote title' }));
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://example.com/mcp');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockGetServerInfo).toHaveBeenCalledWith({
      baseUrl: 'https://example.com/mcp',
      headers: {},
    });
    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com/mcp',
        description: 'Remote instructions',
        name: 'Remote title',
      }),
    );
    expect(mockRouterReplace).toHaveBeenCalledWith({
      params: { serverId: 'server-1' },
      pathname: '/settings/mcp/[serverId]',
    });
  });

  it('shows a header loading indicator during remote server discovery', async () => {
    const serverInfo = deferred<{
      instructions: string;
      name: string;
      title: string;
      version: string;
    }>();
    mockGetServerInfo.mockReturnValue(serverInfo.promise);
    mockCreateServer.mockResolvedValue(makeServer({ name: 'Remote title' }));
    const tree = await render();
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://example.com/mcp');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
      await Promise.resolve();
    });

    const savingAction = mockHeaderProps.rightActions?.find((action) => action.key === 'save');
    expect(savingAction?.disabled).toBe(true);
    expect(savingAction?.element).toBeDefined();

    serverInfo.resolve({
      instructions: 'Remote instructions',
      name: 'remote-name',
      title: 'Remote title',
      version: '1.0.0',
    });
    await act(async () => {
      await serverInfo.promise;
      await Promise.resolve();
    });
  });

  it('uses the remote server name when its title is unavailable', async () => {
    mockGetServerInfo.mockResolvedValue({ name: 'remote-name', version: '1.0.0' });
    mockCreateServer.mockResolvedValue(makeServer({ name: 'remote-name' }));
    const tree = await render();
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://example.com/mcp');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockCreateServer).toHaveBeenCalledWith(expect.objectContaining({ name: 'remote-name' }));
  });

  it('keeps the URL fallback when the remote server exposes no usable name', async () => {
    mockGetServerInfo.mockResolvedValue({ name: '  ', title: '  ', version: '1.0.0' });
    mockCreateServer.mockResolvedValue(makeServer({ name: 'example.com' }));
    const tree = await render();
    const urlInput = tree.root.find(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLabel === 'settings.mcp.fields.baseUrl',
    );

    await act(async () => {
      urlInput.props.onChangeText('https://example.com/mcp');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockCreateServer).toHaveBeenCalledWith(expect.objectContaining({ name: 'example.com' }));
  });

  it('shows tabs for a saved server and switches to the tools-only view', async () => {
    mockServerId = 'server-1';
    mockServer = makeServer();
    const tree = await render();

    expect(mockHeaderProps.titleElement).toBeDefined();
    expect(mockHeaderProps.titleElement?.props.tab).toBe('configuration');
    expect(mockHeaderProps.rightActions?.map((action) => action.key)).toEqual(['edit']);
    expect(mockHeaderProps.rightActions?.[0]?.label).toBe('Edit');
    expect(
      tree.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'mcp-server-chrome',
      ),
    ).toHaveLength(1);

    await act(async () => {
      mockHeaderProps.titleElement?.props.onTabChange('tools');
    });

    expect(mockHeaderProps.rightActions).toBeUndefined();
    expect(mockHeaderProps.titleElement?.props.tab).toBe('tools');
    const [tools] = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'mcp-tools-section',
    );
    expect(tools.props.isReadOnly).toBe(false);
  });

  it('keeps configuration read-only until Edit is pressed', async () => {
    mockServerId = 'server-1';
    mockServer = makeServer();
    const tree = await render();
    const findNameInput = () =>
      tree.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.name',
      );

    expect(findNameInput().props.isDisabled).toBe(true);

    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'edit')?.onPress?.();
    });

    expect(findNameInput().props.isDisabled).toBe(false);
    expect(mockHeaderProps.rightActions?.map((action) => action.key)).toEqual(['save']);
    expect(mockHeaderProps.rightActions?.[0]?.label).toBe('Save');
    expect(mockHeaderProps.title).toBe('Config');
    expect(mockHeaderProps.titleElement).toBeUndefined();
  });

  it('persists the user-entered name without reading remote server info when editing', async () => {
    mockServerId = 'server-1';
    mockServer = makeServer();
    mockUpdateServer.mockResolvedValue(makeServer({ name: 'Custom name' }));
    const tree = await render();
    const findNameInput = () =>
      tree.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.name',
      );

    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'edit')?.onPress?.();
    });
    await act(async () => {
      findNameInput().props.onChangeText('Custom name');
    });
    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockUpdateServer).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({ name: 'Custom name' }),
    );
    expect(mockGetServerInfo).not.toHaveBeenCalled();
  });

  it('preserves the edit draft across server cache updates and omits active state from save', async () => {
    mockServerId = 'server-1';
    mockServer = makeServer();
    mockUpdateServer.mockResolvedValue(makeServer({ isActive: false, name: 'Draft name' }));
    const tree = await render();
    const findNameInput = () =>
      tree.root.find(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'settings.mcp.fields.name',
      );

    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'edit')?.onPress?.();
      findNameInput().props.onChangeText('Draft name');
    });

    mockServer = makeServer({ isActive: false });
    await act(async () => {
      tree.update(renderSubject());
    });

    expect(findNameInput().props.value).toBe('Draft name');
    expect(tree.root.findByProps({ testID: 'mcp-server-chrome' }).props.isDisabled).toBe(true);

    await act(async () => {
      mockHeaderProps.rightActions?.find((action) => action.key === 'save')?.onPress?.();
    });

    expect(mockUpdateServer).toHaveBeenCalledWith(
      'server-1',
      expect.not.objectContaining({ isActive: expect.anything() }),
    );
    expect(mockUpdateServer).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({ name: 'Draft name' }),
    );
  });

  it('requests confirmation before deleting a saved server', async () => {
    mockServerId = 'server-1';
    mockServer = makeServer();
    const tree = await render();
    const [chrome] = tree.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'mcp-server-chrome',
    );

    chrome.props.onDelete();

    expect(mockRequestConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'settings.mcp.delete.message',
        title: 'settings.mcp.delete.title',
      }),
    );
    mockDeleteServer.mockResolvedValue(undefined);
    await act(async () => {
      await mockRequestConfirm.mock.calls[0][0].onConfirm();
    });
    expect(mockRouterBack).toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
