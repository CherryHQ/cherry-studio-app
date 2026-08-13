import { BellRingIcon } from '@cherrystudio/app-icons';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { McpToolPart } from '../McpToolPart';
import { MetaToolPart } from '../MetaToolPart';
import { ToolPart } from '../ToolPart';
import { WebSearchToolPart } from '../WebSearchToolPart';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-image', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('../ToolPartSheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ToolPartSheet: ({ children, ...props }: { children: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
    ToolPartTrigger: (props: Record<string, unknown>) => <MockView {...props} />,
  };
});

describe('tool message detail sheets', () => {
  let renderer: ReactTestRenderer | undefined;
  const originalPlatform = Platform.OS;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    setPlatform(originalPlatform);
  });

  it('opens generic tool details from the message status row', async () => {
    await render(
      <ToolPart
        part={makeToolPart({
          input: { expression: '1 + 1' },
          output: { value: 2 },
          title: 'Calculator',
          toolName: 'calculator',
        })}
      />,
    );

    expect(findAllByTestID('tool-part-detail')).toHaveLength(0);

    await act(async () => {
      findByTestID('tool-part-trigger').props.onPress();
    });

    expect(findByTestID('tool-part-trigger').props.statusText).toBeUndefined();
    const detail = findByTestID('tool-part-detail');
    expect(detail.props.title).toBe('Calculator');

    await act(async () => {
      detail.props.onClose();
    });

    expect(findAllByTestID('tool-part-detail')).toHaveLength(0);
  });

  it('uses the uploaded system image for a built-in tool on iOS', async () => {
    setPlatform('ios');
    await render(
      <ToolPart
        part={makeToolPart({
          toolMetadata: { cherry: { tool: { type: 'builtin' } } },
          toolName: 'reminder_list_collections',
        })}
      />,
    );

    const trigger = findByTestID('tool-part-trigger');
    expect(trigger.props.icon).toBeUndefined();
    expect(trigger.props.imageSource).toBeDefined();
    expect(trigger.props.title).toBe('chat.builtinTool.reminders.listLists');
  });

  it('uses the matching Material icon for a built-in tool on Android', async () => {
    setPlatform('android');
    await render(
      <ToolPart
        part={makeToolPart({
          toolMetadata: { cherry: { tool: { type: 'builtin' } } },
          toolName: 'reminder_list_collections',
        })}
      />,
    );

    const trigger = findByTestID('tool-part-trigger');
    expect(trigger.props.icon).toBe(BellRingIcon);
    expect(trigger.props.imageSource).toBeUndefined();
  });

  it('shows a generic tool name without a tool prefix', async () => {
    await render(<ToolPart part={makeToolPart({ toolName: 'calculator' })} />);

    expect(findByTestID('tool-part-trigger').props.title).toBe('calculator');
  });

  it('opens MCP tool details with the server and tool name', async () => {
    await render(
      <McpToolPart
        part={makeToolPart({
          input: { query: 'Cherry Studio' },
          output: { content: [{ text: 'Search result', type: 'text' }] },
          toolMetadata: {
            cherry: { tool: { serverName: 'Exa', type: 'mcp' } },
          },
          toolName: 'mcp__exa__search',
        })}
      />,
    );

    expect(findAllByTestID('mcp-tool-part-detail')).toHaveLength(0);

    await act(async () => {
      findByTestID('mcp-tool-part-trigger').props.onPress();
    });

    expect(findByTestID('mcp-tool-part-trigger').props.statusText).toBeUndefined();
    expect(findByTestID('mcp-tool-part-detail').props.title).toBe('Exa: search');
  });

  it('opens web search results in the shared tool detail sheet', async () => {
    await render(
      <WebSearchToolPart
        part={makeToolPart({
          input: { query: 'Cherry Studio' },
          output: {
            results: [{ id: 'result-1', title: 'Cherry Studio', url: 'https://cherry-ai.com' }],
          },
          toolName: 'builtin_web_search',
        })}
      />,
    );

    const trigger = findByTestID('web-search-tool-part-trigger');
    expect(trigger.props.title).toBe('Cherry Studio');
    expect(trigger.props.statusText).toBe('chat.webSearch.resultCount');
    expect(findAllByTestID('web-search-tool-part-detail')).toHaveLength(0);

    await act(async () => {
      trigger.props.onPress();
    });

    expect(findByTestID('web-search-tool-part-detail').props.title).toBe('Cherry Studio');
    expect(findText('Cherry Studio')).not.toHaveLength(0);
  });

  it.each([
    ['tool_search', 'chat.metaToolSearch.title', 'chat.metaToolSearch.noResults'],
    ['tool_inspect', 'chat.metaToolInspect.title', 'browser.open_url'],
    ['tool_invoke', 'chat.metaToolInvoke.title', 'browser.open_url'],
    ['tool_exec', 'chat.metaToolExec.title', undefined],
  ])('shows concise information for %s', async (toolName, expectedTitle, expectedStatus) => {
    await render(
      <MetaToolPart
        part={makeToolPart({
          input: { name: 'browser.open_url', namespace: 'browser', query: 'open url' },
          title: 'Title with parameters',
          toolName,
        })}
      />,
    );

    expect(findByTestID('meta-tool-part-trigger').props.title).toBe(expectedTitle);
    expect(findByTestID('meta-tool-part-trigger').props.statusText).toBe(expectedStatus);

    await act(async () => {
      findByTestID('meta-tool-part-trigger').props.onPress();
    });

    expect(findByTestID('meta-tool-part-detail').props.title).toBe(expectedTitle);
  });

  it.each([
    [
      'audio',
      { content: [{ data: 'AAAA', mimeType: 'audio/mp3', type: 'audio' }] },
      'chat.mcpTool.audioUnavailable',
    ],
    [
      'resource text',
      { content: [{ resource: { text: 'resource body' }, type: 'resource' }] },
      'resource body',
    ],
    [
      'blob resource',
      {
        content: [
          {
            resource: { blob: 'AAAA', mimeType: 'application/pdf', uri: 'file://doc' },
            type: 'resource',
          },
        ],
      },
      'chat.mcpTool.resourceUnavailable',
    ],
    [
      'resource link',
      {
        content: [{ mimeType: 'text/html', type: 'resource_link', uri: 'https://example.com' }],
      },
      'chat.mcpTool.resourceLink',
    ],
    [
      'unknown content',
      { content: [{ payload: { value: 1 }, type: 'future' }] },
      '{\n  "payload": {\n    "value": 1\n  },\n  "type": "future"\n}',
    ],
  ])('renders %s output instead of reporting no output', async (_name, output, expectedText) => {
    await render(
      <McpToolPart
        part={makeToolPart({
          output,
          toolName: 'mcp__exa__search',
        })}
      />,
    );

    await act(async () => {
      findByTestID('mcp-tool-part-trigger').props.onPress();
    });

    expect(findText(expectedText)).toHaveLength(1);
    expect(findText('chat.mcpTool.noOutput')).toHaveLength(0);
  });

  it('renders image output without an empty text body', async () => {
    await render(
      <McpToolPart
        part={makeToolPart({
          output: { content: [{ data: 'AAAA', mimeType: 'image/png', type: 'image' }] },
          toolName: 'mcp__exa__search',
        })}
      />,
    );

    await act(async () => {
      findByTestID('mcp-tool-part-trigger').props.onPress();
    });

    expect(
      renderer?.root
        .findAllByType(View)
        .filter((node) => node.props.source === 'data:image/png;base64,AAAA'),
    ).toHaveLength(1);
    expect(findText('')).toHaveLength(0);
    expect(findText('chat.mcpTool.response')).toHaveLength(1);
  });

  it('shows the original tool_search error in details', async () => {
    await render(
      <MetaToolPart
        part={makeToolPart({
          errorText: 'Registry request timed out',
          state: 'output-error',
          toolName: 'tool_search',
        })}
      />,
    );

    await act(async () => {
      findByTestID('meta-tool-part-trigger').props.onPress();
    });

    expect(findText('Registry request timed out')).toHaveLength(1);
  });

  it('marks failures as dangerous and denials as warnings', async () => {
    await render(
      <ToolPart
        part={makeToolPart({
          errorText: 'Timed out',
          state: 'output-error',
          title: 'Failed tool',
          toolName: 'failed_tool',
        })}
      />,
    );

    expect(findByTestID('tool-part-trigger').props.statusText).toBe('chat.tool.callError');
    expect(findByTestID('tool-part-trigger').props.statusTone).toBe('danger');

    await act(async () => {
      renderer?.update(
        <McpToolPart
          part={makeToolPart({
            errorText: 'Timed out',
            state: 'output-error',
            toolName: 'mcp__exa__search',
          })}
        />,
      );
    });

    expect(findByTestID('mcp-tool-part-trigger').props.statusText).toBe('chat.mcpTool.callError');
    expect(findByTestID('mcp-tool-part-trigger').props.statusTone).toBe('danger');

    await act(async () => {
      renderer?.update(
        <ToolPart
          part={makeToolPart({
            approval: { approved: false, id: 'approval-1' },
            state: 'approval-responded',
            title: 'Denied tool',
            toolName: 'denied_tool',
          })}
        />,
      );
    });

    expect(findByTestID('tool-part-trigger').props.statusText).toBe('chat.tool.runDenied');
    expect(findByTestID('tool-part-trigger').props.statusTone).toBe('warning');

    await act(async () => {
      renderer?.update(
        <McpToolPart
          part={makeToolPart({
            state: 'output-denied',
            toolName: 'mcp__exa__search',
          })}
        />,
      );
    });

    expect(findByTestID('mcp-tool-part-trigger').props.statusText).toBe('chat.mcpTool.runDenied');
    expect(findByTestID('mcp-tool-part-trigger').props.statusTone).toBe('warning');

    await act(async () => {
      renderer?.update(
        <MetaToolPart
          part={makeToolPart({
            errorText: 'Timed out',
            state: 'output-error',
            toolName: 'tool_invoke',
          })}
        />,
      );
    });

    expect(findByTestID('meta-tool-part-trigger').props.statusText).toBe('chat.tool.callError');
    expect(findByTestID('meta-tool-part-trigger').props.statusTone).toBe('danger');

    await act(async () => {
      renderer?.update(
        <MetaToolPart
          part={makeToolPart({
            state: 'output-denied',
            toolName: 'tool_invoke',
          })}
        />,
      );
    });

    expect(findByTestID('meta-tool-part-trigger').props.statusText).toBe('chat.tool.runDenied');
    expect(findByTestID('meta-tool-part-trigger').props.statusTone).toBe('warning');
  });

  async function render(element: ReactElement) {
    await act(async () => {
      renderer = create(element);
    });
  }

  function findByTestID(testID: string) {
    if (!renderer) {
      throw new Error('Renderer was not created');
    }
    return renderer.root.findByProps({ testID });
  }

  function findAllByTestID(testID: string) {
    return renderer?.root.findAllByProps({ testID }) ?? [];
  }

  function findText(text: string) {
    return renderer?.root.findAllByType(Text).filter((node) => node.props.children === text) ?? [];
  }
});

function makeToolPart(overrides: Record<string, unknown>): ToolMessagePart {
  return {
    input: {},
    output: {},
    state: 'output-available',
    toolCallId: 'call-1',
    type: 'dynamic-tool',
    ...overrides,
  } as unknown as ToolMessagePart;
}

function setPlatform(platform: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}
