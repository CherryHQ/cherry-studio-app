import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { isReadFileToolPart, ReadFileToolPart } from '../ReadFileToolPart';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    MessagePart: {
      TextSection: (props: object) => createElement('TextSection', props),
      Tool: (props: object) => createElement('Tool', props),
      ValueSection: (props: object) => createElement('ValueSection', props),
    },
  };
});

jest.mock('../GenericToolPart', () => {
  const { createElement } = jest.requireActual('react');
  return { GenericToolPart: (props: object) => createElement('GenericToolPart', props) };
});

describe('ReadFileToolPart', () => {
  it('claims only read_file parts', () => {
    expect(isReadFileToolPart(toolPart({ output: {} }))).toBe(true);
    expect(isReadFileToolPart(toolPart({ output: {}, toolName: 'edit_file' }))).toBe(false);
  });

  it('summarizes the returned line range instead of repeating the text', () => {
    const renderer = render(
      toolPart({
        output: {
          status: 'ok',
          filename: 'notes.md',
          startLine: 101,
          lineCount: 20,
          totalLines: 480,
          text: 'x'.repeat(5000),
        },
      }),
    );

    expect(renderer.root.findAllByType('GenericToolPart')).toHaveLength(0);
    expect(renderer.root.findByType('ValueSection').props.value).toEqual({
      'chat.builtinTool.file.filename': 'notes.md',
      'chat.builtinTool.file.lines': '101-120 / 480',
    });
  });

  it('surfaces a rejection', () => {
    const renderer = render(
      toolPart({ output: { status: 'error', message: 'The managed file is unavailable.' } }),
    );

    expect(renderer.root.findByType('TextSection').props.value).toBe(
      'The managed file is unavailable.',
    );
  });

  it.each([
    ['a non-object output', 'ok'],
    ['a missing line count', { status: 'ok', filename: 'notes.md', startLine: 1, totalLines: 1 }],
  ])('falls back to generic rendering for %s', (_case, output) => {
    expect(render(toolPart({ output })).root.findByType('GenericToolPart')).toBeDefined();
  });
});

function render(part: ToolMessagePart): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ReadFileToolPart part={part} />);
  });
  return renderer;
}

function toolPart(overrides: Partial<Record<string, unknown>>): ToolMessagePart {
  return {
    input: {},
    state: 'output-available',
    toolCallId: 'call-1',
    toolName: 'read_file',
    type: 'dynamic-tool',
    ...overrides,
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}
