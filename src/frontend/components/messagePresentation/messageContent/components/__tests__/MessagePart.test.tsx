import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessagePart } from '../MessagePart';

jest.mock('../CodePart', () => ({ CodePart: () => null }));
jest.mock('../CompactPart', () => ({ CompactPart: () => null }));
jest.mock('../ErrorPart', () => ({ ErrorPart: () => null }));
jest.mock('../FilePart', () => ({ FilePart: () => null }));
jest.mock('../ReasoningPart', () => ({ ReasoningPart: () => null }));
jest.mock('../SourceDocumentPart', () => ({ SourceDocumentPart: () => null }));
jest.mock('../SourceUrlPart', () => ({ SourceUrlPart: () => null }));
jest.mock('../TextPart', () => ({ TextPart: () => null }));
jest.mock('../TranslationPart', () => ({ TranslationPart: () => null }));
jest.mock('../UnknownPart', () => ({ UnknownPart: () => null }));
jest.mock('../VideoPart', () => ({ VideoPart: () => null }));

jest.mock('../ProviderConfigToolPart', () => {
  const React = jest.requireActual('react');
  return {
    isProviderConfigToolPart: (part: { toolName?: string; type: string }) =>
      (part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length)) ===
      'configure_builtin_provider',
    ProviderConfigToolPart: (props: object) => React.createElement('ProviderConfigToolPart', props),
  };
});

jest.mock('../McpToolPart', () => ({
  isMcpToolPart: () => false,
  McpToolPart: () => null,
}));
jest.mock('../MetaToolPart', () => ({
  isMetaToolPart: () => false,
  MetaToolPart: () => null,
}));
jest.mock('../WebSearchToolPart', () => ({
  isProviderWebSearchToolPart: () => false,
  isWebSearchToolPart: () => false,
  WebSearchToolPart: () => null,
}));
jest.mock('../ToolPart', () => {
  const React = jest.requireActual('react');
  return { ToolPart: (props: object) => React.createElement('ToolPart', props) };
});

describe('MessagePart tool routing', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('dispatches provider configuration before the generic tool part', () => {
    const part = {
      input: {},
      output: {},
      state: 'output-available',
      toolCallId: 'call-1',
      toolName: 'configure_builtin_provider',
      type: 'dynamic-tool',
    } as unknown as CherryMessagePart;

    act(() => {
      renderer = create(<MessagePart isStreaming={false} part={part} />);
    });

    expect(renderer!.root.findAllByType('ProviderConfigToolPart')).toHaveLength(1);
    expect(renderer!.root.findAllByType('ToolPart')).toHaveLength(0);
  });
});
