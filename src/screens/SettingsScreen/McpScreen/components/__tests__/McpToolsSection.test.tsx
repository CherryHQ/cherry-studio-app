import { Switch } from 'heroui-native/switch';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { StreamableHttpMcpServer } from '@/data/types/mcpServer';
import { McpToolsSection } from '../McpToolsSection';

type ToolsQueryResult = { data?: { name: string }[]; isError: boolean };

const mockRefetch = jest.fn<Promise<ToolsQueryResult>, []>();
const mockToastShow = jest.fn();
const mockUseQuery = jest.fn((_options: unknown) => ({
  ...mockToolsQuery,
  refetch: mockRefetch,
}));
let mockToolsQuery: ToolsQueryResult & { isLoading: boolean };

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

jest.mock('@/data/runtime', () => ({
  useDataServices: () => ({ mcp: { listToolsForServer: jest.fn() } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('heroui-native/spinner', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Spinner: MockView };
});

jest.mock('heroui-native/switch', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return { Switch: (props: Record<string, unknown>) => <MockPressable {...props} /> };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('../../../components/SettingsDialogActionButton', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    SettingsDialogActionButton: (props: { children?: ReactNode }) => <MockView {...props} />,
  };
});

const serverWildcard = 'mcp__myServer__*';

function makeServer(disabledAutoApproveTools: string[]): StreamableHttpMcpServer {
  return {
    baseUrl: 'https://a.example/mcp',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '',
    disabledAutoApproveTools,
    disabledTools: [],
    headers: {},
    id: 'server-1',
    isActive: true,
    name: 'My Server',
    type: 'streamableHttp',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('McpToolsSection auto-approve toggle', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockToolsQuery = {
      data: [{ name: 'search_docs' }, { name: 'read_file' }],
      isError: false,
      isLoading: false,
    };
  });

  afterEach(async () => {
    await act(() => renderer.unmount());
  });

  function render(
    disabledAutoApproveTools: string[],
    disabledTools: string[] = [],
    serverOverrides: Partial<StreamableHttpMcpServer> = {},
    isReadOnly = false,
  ) {
    const server = { ...makeServer(disabledAutoApproveTools), ...serverOverrides, disabledTools };
    const onToggleAutoApprove = jest.fn();
    const onToggleTool = jest.fn();

    act(() => {
      renderer = create(
        <McpToolsSection
          isReadOnly={isReadOnly}
          onToggleAutoApprove={onToggleAutoApprove}
          onToggleTool={onToggleTool}
          server={server}
        />,
      );
    });

    return { onToggleAutoApprove, onToggleTool };
  }

  /** The first tool row's switches, in column order: enabled, auto-approve. */
  async function toggleFirstTool(column: 'autoApprove' | 'enabled', isSelected: boolean) {
    const toggle = renderer.root.findAllByType(Switch)[column === 'enabled' ? 0 : 1];
    await act(async () => toggle.props.onSelectedChange(isSelected));
  }

  async function toggleFirstToolAutoApprove(autoApprove: boolean) {
    await toggleFirstTool('autoApprove', autoApprove);
  }

  test('does not query tools until a synchronized server has an HTTP URL', () => {
    render([], [], { baseUrl: '' });

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  test('disables both tool controls in read-only mode', () => {
    render([], [], {}, true);

    expect(renderer.root.findAllByType(Switch).map((toggle) => toggle.props.isDisabled)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  test('needs no tool list when no rule is wider than one tool', async () => {
    const { onToggleAutoApprove } = render(['search_docs']);

    await toggleFirstToolAutoApprove(true);

    // Nothing to re-expand, so no round trip and nothing to expand against.
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(onToggleAutoApprove).toHaveBeenCalledWith('search_docs', true, ['search_docs']);
  });

  test('re-reads the tool list before clearing a server-wide rule', async () => {
    mockRefetch.mockResolvedValue({
      data: [{ name: 'search_docs' }, { name: 'read_file' }, { name: 'write_file' }],
      isError: false,
    });
    const { onToggleAutoApprove } = render([serverWildcard]);

    await toggleFirstToolAutoApprove(true);

    // The wildcard is rewritten as one entry per tool it still covers, so a
    // tool missing from the stale render would silently lose its rule.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(onToggleAutoApprove).toHaveBeenCalledWith('search_docs', true, [
      'search_docs',
      'read_file',
      'write_file',
    ]);
  });

  test('reports the failure and writes nothing when the re-read fails', async () => {
    // A refetch that fails after a good first load keeps the data it already
    // had, so the write has to key off `isError` — expanding against a list
    // that predates the failure is the very thing the round trip prevents.
    mockRefetch.mockResolvedValue({
      data: [{ name: 'search_docs' }, { name: 'read_file' }],
      isError: true,
    });
    const { onToggleAutoApprove } = render([serverWildcard]);

    await toggleFirstToolAutoApprove(true);

    expect(onToggleAutoApprove).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.mcp.tools.refreshFailed',
      variant: 'danger',
    });
  });

  test('needs no tool list at all to add a rule', async () => {
    const { onToggleAutoApprove } = render([serverWildcard]);

    await toggleFirstToolAutoApprove(false);

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(onToggleAutoApprove).toHaveBeenCalledWith('search_docs', false, []);
  });

  test('re-reads for the enabled column too, off its own rule list', async () => {
    mockRefetch.mockResolvedValue({
      data: [{ name: 'search_docs' }, { name: 'read_file' }, { name: 'write_file' }],
      isError: false,
    });
    const { onToggleTool } = render([], [serverWildcard]);

    await toggleFirstTool('enabled', true);

    // The two columns read different rule lists; swapping them would re-expand
    // a wildcard against the wrong one and switch tools back on silently.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(onToggleTool).toHaveBeenCalledWith('search_docs', true, [
      'search_docs',
      'read_file',
      'write_file',
    ]);
  });
});
