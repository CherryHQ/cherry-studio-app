import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { GenericToolPart } from '../GenericToolPart';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../builtInTool/builtInToolDisplay', () => ({ getBuiltInToolDisplay: () => undefined }));
jest.mock('../ToolResultContentRenderer', () => ({ ToolResultContentRenderer: () => null }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    hasMessagePartValue: (value: unknown) => value !== undefined,
    MessagePart: {
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
        { id: 'parent/c1', name: 'mcp_lookup', args: '{"query":"notes"}', status: 'running' },
      ],
    },
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<GenericToolPart part={part} />);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('mcp_lookup');
  expect(JSON.stringify(renderer.toJSON())).toContain('chat.tool.running');
  expect(
    renderer.root.findAllByType('ValueSection').map((section) => section.props.value),
  ).toContain('{"query":"notes"}');
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
  expect(JSON.stringify(renderer.toJSON())).not.toContain('chat.tool.running');
  act(() => renderer.unmount());
});
