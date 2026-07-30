import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { McpServerRuntimeSummary } from '@/ai/mcp';
import type { StreamableHttpMcpServer } from '@/shared/domain/mcpServer';
import { McpScreen } from '../McpScreen';

type HeaderAction = { key: string; onPress?: () => void };

const mockPush = jest.fn();
const mockRefetch = jest.fn();
let mockListError: unknown;
let mockListLoading = false;
let mockRightActions: readonly HeaderAction[] = [];
let mockServers: StreamableHttpMcpServer[] = [];
let mockSummaries: Record<string, McpServerRuntimeSummary> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-uniwind/png', () => ({ PlusIcon: () => null }));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: ({ rightActions }: { rightActions?: readonly HeaderAction[] }) => {
    mockRightActions = rightActions ?? [];
    return null;
  },
}));

jest.mock('@/frontend/hooks/mcp/useMcpServers', () => ({
  useMcpServerRuntimeSummaries: () => ({ summaries: mockSummaries }),
  useMcpServersApi: () => ({
    error: mockListError,
    isLoading: mockListLoading,
    refetch: mockRefetch,
    servers: mockServers,
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

jest.mock('@/frontend/features/settings/components/SettingsServiceRow', () => ({
  SettingsServiceRow: (props: Record<string, unknown>) => {
    const { View: MockView } = jest.requireActual('react-native');

    return <MockView {...props} testID="mcp-server-row" />;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      ({
        'settings.mcp.addServer': 'Add server',
        'settings.mcp.defaultName': 'MCP Server',
        'settings.mcp.emptyAction': 'Add MCP server',
        'settings.mcp.list.status.connected': 'Enabled',
        'settings.mcp.list.status.connecting': 'Connecting',
        'settings.mcp.list.status.disabled': 'Disabled',
        'settings.mcp.list.status.error': 'Connection failed',
        'settings.mcp.list.loadFailed': 'Failed to load MCP servers.',
        'settings.mcp.list.loading': 'Loading MCP servers...',
        'settings.mcp.list.toolCount': `${options?.count} tools`,
        'settings.mcp.retry': 'Retry',
        'settings.pages.mcp.title': 'MCP',
      })[key] ?? key,
  }),
}));

describe('McpScreen empty state', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRightActions = [];
    mockListError = undefined;
    mockListLoading = false;
    mockServers = [];
    mockSummaries = {};
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('uses the same create route for the empty-state button and header action', async () => {
    await act(async () => {
      renderer = create(<McpScreen />);
    });

    if (!renderer) {
      throw new Error('McpScreen test renderer was not created.');
    }

    const [emptyAction] = renderer.root.findAll(
      (node) =>
        node.props.accessibilityLabel === 'Add MCP server' &&
        typeof node.props.onPress === 'function',
    );
    emptyAction.props.onPress();

    const headerAction = mockRightActions.find((action) => action.key === 'create-mcp-server');
    headerAction?.onPress?.();

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenNthCalledWith(1, {
      params: { serverId: 'new' },
      pathname: './mcp/[serverId]',
    });
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      params: { serverId: 'new' },
      pathname: './mcp/[serverId]',
    });
  });

  it('shows loading without the empty-state action', async () => {
    mockListLoading = true;

    await act(async () => {
      renderer = create(<McpScreen />);
    });

    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Add MCP server' })).toHaveLength(0);
    expect(
      renderer?.root.findAll((node) => node.props.children === 'Loading MCP servers...'),
    ).not.toHaveLength(0);
  });

  it('shows the list error and retries without rendering an empty state', async () => {
    mockListError = new Error('database unavailable');

    await act(async () => {
      renderer = create(<McpScreen />);
    });

    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Add MCP server' })).toHaveLength(0);
    expect(
      renderer?.root.findAll((node) => node.props.children === 'database unavailable'),
    ).not.toHaveLength(0);

    renderer?.root.findByProps({ accessibilityLabel: 'Retry' }).props.onPress();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders saved servers without a leading icon', async () => {
    mockServers = [
      {
        baseUrl: 'https://example.com/mcp',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: '',
        disabledAutoApproveTools: [],
        disabledTools: [],
        headers: {},
        id: 'server-1',
        isActive: true,
        name: 'Example',
        type: 'streamableHttp',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockServers[0].description = 'Access repositories';
    mockSummaries = {
      'server-1': {
        serverName: 'remote-name',
        serverTitle: 'Remote title',
        serverVersion: '1.2.3',
        state: 'connected',
        toolCount: 2,
      },
    };

    await act(async () => {
      renderer = create(<McpScreen />);
    });

    const row = renderer?.root.findByProps({ testID: 'mcp-server-row' });
    expect(row?.props.imageSource).toBeUndefined();
    expect(row?.props.name).toBe('Example');
    expect(row?.props.statusLabel).toBe('Enabled');
    expect(row?.props.statusTone).toBe('success');
    expect(row?.props.subtitle).toBe('2 tools · v1.2.3');
  });

  it('separates every server row but the first', async () => {
    mockServers = ['server-1', 'server-2', 'server-3'].map((id) => ({
      baseUrl: 'https://example.com/mcp',
      createdAt: '2026-01-01T00:00:00.000Z',
      description: '',
      disabledAutoApproveTools: [],
      disabledTools: [],
      headers: {},
      id,
      isActive: true,
      name: id,
      type: 'streamableHttp',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    await act(async () => {
      renderer = create(<McpScreen />);
    });

    const rows = renderer?.root.findAllByProps({ testID: 'mcp-server-row' }) ?? [];
    // `findAllByProps` matches the composite `View` and the host node it renders,
    // so keep the host nodes to get one entry per row.
    const hostRows = rows.filter((row) => typeof row.type === 'string');
    expect(hostRows.map((row) => row.props.showSeparator)).toEqual([false, true, true]);
  });

  it('renders a connecting server as a single line', async () => {
    mockServers = [
      {
        baseUrl: 'https://example.com/mcp',
        createdAt: '2026-01-01T00:00:00.000Z',
        description: '',
        disabledAutoApproveTools: [],
        disabledTools: [],
        headers: {},
        id: 'server-1',
        isActive: true,
        name: 'Example',
        type: 'streamableHttp',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    await act(async () => {
      renderer = create(<McpScreen />);
    });

    const row = renderer?.root.findByProps({ testID: 'mcp-server-row' });
    expect(row?.props.statusLabel).toBe('Connecting');
    expect(row?.props.subtitle).toBeUndefined();
  });
});
