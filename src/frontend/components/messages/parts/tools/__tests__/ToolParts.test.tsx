import type { ReactElement, ReactNode } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { GenericToolPart } from '../GenericToolPart';
import { McpToolPart } from '../McpToolPart';
import { MetaToolPartRenderer } from '../metaTool/MetaToolPartRenderer';
import { WebSearchToolPart } from '../WebSearchToolPart';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('expo-image', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: (props: Record<string, unknown>) => <MockView {...props} /> };
});

jest.mock('@/frontend/components/markdown', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    MarkdownText: (props: Record<string, unknown>) => (
      <MockView {...props} testID="mock-markdown-text" />
    ),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  const isValueRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const hasValue = (value: unknown) =>
    value !== undefined &&
    value !== null &&
    (!isValueRecord(value) || Object.keys(value).length > 0);
  const formatValue = (value: unknown) =>
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const Tool = ({
    children,
    testID,
    ...props
  }: {
    children: ReactNode;
    testID: string;
    title: string;
  }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
      <>
        <MockView {...props} onPress={() => setIsOpen(true)} testID={`${testID}-trigger`} />
        {isOpen ? (
          <MockView
            onClose={() => setIsOpen(false)}
            testID={`${testID}-detail`}
            title={props.title}
          >
            {children}
          </MockView>
        ) : null}
      </>
    );
  };

  return {
    formatMessagePartValue: formatValue,
    hasMessagePartValue: hasValue,
    MessagePart: {
      SectionTitle: ({ title }: { title: string }) => <MockText>{title}</MockText>,
      Source: ({ label }: { label: string }) => <MockText>{label}</MockText>,
      TextSection: ({ title, value, ...props }: { title: string; value: string }) => (
        <MockView {...props}>
          <MockText>{title}</MockText>
          <MockText>{value}</MockText>
        </MockView>
      ),
      Tool,
      ValueSection: ({ title, value }: { title: string; value: unknown }) =>
        hasValue(value) ? (
          <MockView>
            <MockText>{title}</MockText>
            <MockText>{formatValue(value)}</MockText>
          </MockView>
        ) : null,
    },
  };
});

describe('tool message detail sheets', () => {
  let renderer: ReactTestRenderer | undefined;
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('opens generic tool details from the message status row', async () => {
    await render(
      <GenericToolPart
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
    expect(textIndex('chat.tool.output')).toBeLessThan(textIndex('chat.tool.arguments'));

    await act(async () => {
      detail.props.onClose();
    });

    expect(findAllByTestID('tool-part-detail')).toHaveLength(0);
  });

  it('shows a generic tool name without a tool prefix', async () => {
    await render(<GenericToolPart part={makeToolPart({ toolName: 'calculator' })} />);

    expect(findByTestID('tool-part-trigger').props.title).toBe('calculator');
  });

  it('renders structured generic output as a highlighted JSON block', async () => {
    await render(
      <GenericToolPart part={makeToolPart({ output: { answer: 42 }, toolName: 'calculator' })} />,
    );

    await act(async () => {
      findByTestID('tool-part-trigger').props.onPress();
    });

    expect(findByTestID('mock-markdown-text').props).toMatchObject({
      markdown: '```json\n{\n  "answer": 42\n}\n```',
      selectable: false,
    });
  });

  it('maps a processing generic tool to the shared running state', async () => {
    await render(
      <GenericToolPart part={makeToolPart({ state: 'input-available', toolName: 'calculator' })} />,
    );

    const trigger = findByTestID('tool-part-trigger');
    expect(trigger.props.state).toBe('running');
    expect(trigger.props.statusText).toBe('chat.tool.inputReady');
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
    expect(textIndex('chat.mcpTool.response')).toBeLessThan(textIndex('chat.mcpTool.arguments'));
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

  it('keeps the searching label while using the shared running state', async () => {
    await render(
      <WebSearchToolPart
        part={makeToolPart({
          input: { query: 'Cherry Studio' },
          state: 'input-available',
          toolName: 'builtin_web_search',
        })}
      />,
    );

    const trigger = findByTestID('web-search-tool-part-trigger');
    expect(trigger.props.state).toBe('running');
    expect(trigger.props.statusText).toBe('chat.webSearch.searching');
  });

  it.each([
    ['tool_search', 'chat.metaToolSearch.title', 'chat.metaToolSearch.noResults'],
    ['tool_describe', 'chat.metaToolInspect.title', 'browser.open_url'],
    ['tool_inspect', 'chat.metaToolInspect.title', 'browser.open_url'],
    ['tool_call', 'chat.metaToolInvoke.title', 'browser.open_url'],
    ['tool_invoke', 'chat.metaToolInvoke.title', 'browser.open_url'],
    ['tool_exec', 'chat.metaToolExec.title', undefined],
  ])('shows concise information for %s', async (toolName, expectedTitle, expectedStatus) => {
    await render(
      <MetaToolPartRenderer
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

  it('does not expose unresolved tool_call parameters', async () => {
    await render(
      <MetaToolPartRenderer
        part={makeToolPart({
          input: { name: 'missing.tool', params: { secret: 'must-not-render' } },
          state: 'output-error',
          toolName: 'tool_call',
        })}
      />,
    );

    await act(async () => {
      findByTestID('meta-tool-part-trigger').props.onPress();
    });

    expect(findText('must-not-render')).toHaveLength(0);
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

  it('renders unknown MCP content as formatted JSON code', async () => {
    await render(
      <McpToolPart
        part={makeToolPart({
          output: { content: [{ payload: { value: 1 }, type: 'future' }] },
          toolName: 'mcp__exa__search',
        })}
      />,
    );

    await act(async () => {
      findByTestID('mcp-tool-part-trigger').props.onPress();
    });

    expect(findByTestID('mock-markdown-text').props.markdown).toBe(
      '```json\n{\n  "payload": {\n    "value": 1\n  },\n  "type": "future"\n}\n```',
    );
  });

  it('surfaces MCP-declared errors in the completed tool status', async () => {
    await render(
      <McpToolPart
        part={makeToolPart({
          output: {
            content: [{ text: 'Invalid query', type: 'text' }],
            isError: true,
          },
          toolName: 'mcp__exa__search',
        })}
      />,
    );

    expect(findByTestID('mcp-tool-part-trigger').props.statusText).toBe('chat.mcpTool.callError');
    expect(findByTestID('mcp-tool-part-trigger').props.statusTone).toBe('danger');
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
      <MetaToolPartRenderer
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

  it('renders tool_search matches as separate rows', async () => {
    await render(
      <MetaToolPartRenderer
        part={makeToolPart({
          input: { namespace: 'browser', query: 'open url' },
          output: {
            matchedNamespaces: [
              { namespace: 'browser', tools: [{ name: 'open_url' }, { name: 'screenshot' }] },
            ],
          },
          toolName: 'tool_search',
        })}
      />,
    );

    await act(async () => {
      findByTestID('meta-tool-part-trigger').props.onPress();
    });

    expect(
      renderer?.root
        .findAllByType(View)
        .filter((node) => node.props.testID === 'meta-tool-search-result'),
    ).toHaveLength(2);
  });

  it('uses code typography for a structured tool_invoke response', async () => {
    await render(
      <MetaToolPartRenderer
        part={makeToolPart({
          output: { format: 'png', ok: true },
          toolName: 'tool_invoke',
        })}
      />,
    );

    await act(async () => {
      findByTestID('meta-tool-part-trigger').props.onPress();
    });

    expect(renderer?.root.findByProps({ variant: 'code' })).toBeDefined();
  });

  it('marks failures as dangerous and denials as warnings', async () => {
    await render(
      <GenericToolPart
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
        <GenericToolPart
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
        <MetaToolPartRenderer
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
        <MetaToolPartRenderer
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

  function textIndex(text: string) {
    return (
      renderer?.root.findAllByType(Text).findIndex((node) => node.props.children === text) ?? -1
    );
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
