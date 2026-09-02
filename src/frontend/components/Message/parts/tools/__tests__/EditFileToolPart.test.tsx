import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { EditFileToolPart, isEditFileToolPart } from '../EditFileToolPart';
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

describe('EditFileToolPart', () => {
  it('claims only edit_file parts', () => {
    expect(isEditFileToolPart(toolPart({ output: {} }))).toBe(true);
    expect(isEditFileToolPart(toolPart({ output: {}, toolName: 'write_file' }))).toBe(false);
  });

  it('summarizes a successful edit without duplicating the artifact card', () => {
    const renderer = render(
      toolPart({
        output: { status: 'edited', filename: 'notes.md', replacements: 3, size: 1250 },
      }),
    );

    expect(renderer.root.findAllByType('GenericToolPart')).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'edit-file-tool-part' }).props.statusText).toBe(
      'chat.builtinTool.file.edited',
    );
    expect(renderer.root.findByType('ValueSection').props.value).toEqual({
      'chat.builtinTool.file.filename': 'notes.md',
      'chat.builtinTool.file.replacements': '3',
      'chat.builtinTool.file.size': '1.3 KB',
    });
  });

  it('surfaces a repairable edit rejection', () => {
    const renderer = render(
      toolPart({ output: { status: 'error', message: 'old_string was not found.' } }),
    );

    expect(renderer.root.findByType('TextSection').props.value).toBe('old_string was not found.');
  });

  it.each([
    ['a non-object output', 'edited'],
    ['an invalid replacement count', { status: 'edited', filename: 'notes.md', replacements: 0 }],
    ['an error without a message', { status: 'error' }],
  ])('falls back to generic rendering for %s', (_case, output) => {
    expect(render(toolPart({ output })).root.findByType('GenericToolPart')).toBeDefined();
  });

  it('uses generic rendering while the edit is running', () => {
    expect(
      render(toolPart({ state: 'input-available' })).root.findByType('GenericToolPart'),
    ).toBeDefined();
  });
});

function render(part: ToolMessagePart): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<EditFileToolPart part={part} />);
  });
  return renderer;
}

function toolPart(overrides: Partial<Record<string, unknown>>): ToolMessagePart {
  return {
    input: {},
    state: 'output-available',
    toolCallId: 'call-1',
    toolName: 'edit_file',
    type: 'dynamic-tool',
    ...overrides,
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}
