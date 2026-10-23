import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GenericToolPart } from '../GenericToolPart';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../builtInTool/builtInToolDisplay', () => ({ getBuiltInToolDisplay: () => undefined }));
jest.mock('../ToolResultContentRenderer', () => ({ ToolResultContentRenderer: () => null }));
jest.mock('@/frontend/components/MessageDetail', () => {
  const { createElement } = jest.requireActual('react');
  return {
    MessageDetailText: (props: object) => createElement('TextSection', props),
    MessageDetailValue: (props: object) => createElement('ValueSection', props),
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    hasMessagePartValue: (value: unknown) => value !== undefined,
    MessagePart: {
      TextSection: (props: object) => createElement('TextSection', props),
      Tool: (props: object) => createElement('Tool', props),
      ValueSection: (props: object) => createElement('ValueSection', props),
    },
  };
});

test('shows child activity while the parent is running and updates its status', () => {
  const part: ToolMessagePart = {
    type: 'dynamic-tool',
    toolCallId: 'parent',
    toolName: 'codemode',
    state: 'input-available',
    input: {},
    progress: {
      calls: [
        {
          id: 'parent/c1',
          name: 'mcp_lookup_0ab12cd',
          title: 'lookup',
          args: '{"query":"notes"}',
          status: 'running',
        },
      ],
    },
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<GenericToolPart part={part} />);
  });
  // An MCP call shows its display name, and live calls mark the parent as running.
  expect(JSON.stringify(renderer.toJSON())).toContain('"lookup"');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('mcp_lookup_0ab12cd');
  expect(renderer.root.findByType('Tool').props.statusText).toBe('chat.tool.running');
  // Arguments arrive as cut JSON text, so they read as code instead of a parsed value.
  expect(renderer.root.findAllByType('TextSection').map((section) => section.props.value)).toEqual([
    '{"query":"notes"}',
  ]);
  act(() => {
    renderer.update(
      <GenericToolPart
        part={{
          ...part,
          progress: {
            calls: [{ ...part.progress!.calls[0]!, status: 'ok' }],
          },
        }}
      />,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('common.done');
  act(() => renderer.unmount());
});
