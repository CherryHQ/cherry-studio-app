import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { ToolPartRenderer } from '../ToolPartRenderer';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('../GenericToolPart', () => mockCreateToolPart('GenericToolPart'));
jest.mock('../EditFileToolPart', () => ({
  ...mockCreateToolPart('EditFileToolPart'),
  isEditFileToolPart: (part: ToolMessagePart) => mockGetToolName(part) === 'edit_file',
}));
jest.mock('../McpToolPart', () => ({
  ...mockCreateToolPart('McpToolPart'),
  isMcpToolPart: (part: ToolMessagePart) => mockGetToolName(part) === 'mcp',
}));
jest.mock('../metaTool/MetaToolPartRenderer', () => ({
  ...mockCreateToolPart('MetaToolPartRenderer'),
  isMetaToolPart: (part: ToolMessagePart) => mockGetToolName(part) === 'meta',
}));
jest.mock('../WebSearchToolPart', () => ({
  ...mockCreateToolPart('WebSearchToolPart'),
  isProviderWebSearchToolPart: (part: ToolMessagePart) =>
    mockGetToolName(part) === 'provider-search',
  isWebSearchToolPart: (part: ToolMessagePart) =>
    mockGetToolName(part) === 'provider-search' || mockGetToolName(part) === 'web-search',
}));
jest.mock('../WriteFileToolPart', () => ({
  ...mockCreateToolPart('WriteFileToolPart'),
  isWriteFileToolPart: (part: ToolMessagePart) => mockGetToolName(part) === 'write_file',
}));

describe('ToolPartRenderer', () => {
  it.each([
    ['web-search', 'WebSearchToolPart'],
    ['meta', 'MetaToolPartRenderer'],
    ['mcp', 'McpToolPart'],
    ['edit_file', 'EditFileToolPart'],
    ['write_file', 'WriteFileToolPart'],
    ['other', 'GenericToolPart'],
  ])('routes %s tools to %s', (toolName, expectedType) => {
    const part = makeToolPart(toolName);
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<ToolPartRenderer part={part} />);
    });

    expect(renderer?.root.findByType(expectedType).props.part).toBe(part);
  });

  it('suppresses provider-owned web search parts before general web-search routing', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(<ToolPartRenderer part={makeToolPart('provider-search')} />);
    });

    expect(renderer?.toJSON()).toBeNull();
  });
});

function mockCreateToolPart(name: string) {
  const { createElement } = jest.requireActual('react');
  return { [name]: (props: object) => createElement(name, props) };
}

function mockGetToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function makeToolPart(toolName: string): ToolMessagePart {
  return {
    input: {},
    output: {},
    state: 'output-available',
    toolCallId: 'call-1',
    toolName,
    type: 'dynamic-tool',
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}
