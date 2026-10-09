import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { RunJsToolPart } from '../RunJsToolPart';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    formatMessagePartValue: (value: unknown) => JSON.stringify(value),
    MessagePart: {
      TextSection: (props: object) => createElement('TextSection', props),
      Tool: (props: object) => createElement('Tool', props),
    },
  };
});

jest.mock('../GenericToolPart', () => {
  const { createElement } = jest.requireActual('react');
  return { GenericToolPart: (props: object) => createElement('GenericToolPart', props) };
});

describe('RunJsToolPart', () => {
  it('shows the result, the code as code, and console output', () => {
    const renderer = render(
      toolPart({ output: { status: 'ok', result: { total: 42 }, logs: 'summed\n' } }),
    );

    expect(sections(renderer)).toEqual([
      ['chat.tool.result', '{"total":42}'],
      ['chat.tool.code', 'return { total: 42 }'],
      ['chat.tool.logs', 'summed\n'],
    ]);
  });

  it('shows a falsy result the code did return', () => {
    expect(sections(render(toolPart({ output: { status: 'ok', result: 0 } })))).toEqual([
      ['chat.tool.result', '0'],
      ['chat.tool.code', 'return { total: 42 }'],
    ]);
  });

  it('shows output cut to the model budget in place of the result and console output', () => {
    const cut = 'Warning: truncated output (original token count: 20000)\n…';
    expect(
      sections(
        render(
          toolPart({ output: { status: 'ok', output: cut, fullOutputFileEntryId: 'file-1' } }),
        ),
      ),
    ).toEqual([
      ['chat.tool.result', cut],
      ['chat.tool.code', 'return { total: 42 }'],
    ]);
    expect(
      sections(
        render(
          toolPart({
            output: { status: 'error', kind: 'cancelled', message: 'Cancelled.', output: cut },
          }),
        ),
      ),
    ).toEqual([
      ['chat.tool.error', 'Cancelled.'],
      ['chat.tool.code', 'return { total: 42 }'],
      ['chat.tool.logs', cut],
    ]);
  });

  it('marks a script failure as a failed call', () => {
    const renderer = render(
      toolPart({ output: { status: 'error', kind: 'syntax', message: 'Compiling JS failed' } }),
    );

    expect(renderer.root.findByType('Tool').props.statusTone).toBe('danger');
    expect(sections(renderer)[0]).toEqual(['chat.tool.error', 'Compiling JS failed']);
  });

  it.each([
    ['a running call', { state: 'input-available', output: undefined }],
    ['an unrecognized output', { output: 'ok' }],
  ])('falls back to generic rendering for %s', (_case, overrides) => {
    expect(render(toolPart(overrides)).root.findByType('GenericToolPart')).toBeDefined();
  });
});

function sections(renderer: ReactTestRenderer): [string, string][] {
  return renderer.root
    .findAllByType('TextSection')
    .map((section) => [section.props.title, section.props.value]);
}

function render(part: ToolMessagePart): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<RunJsToolPart part={part} />);
  });
  return renderer;
}

function toolPart(overrides: Partial<Record<string, unknown>>): ToolMessagePart {
  return {
    input: { code: 'return { total: 42 }' },
    state: 'output-available',
    toolCallId: 'call-1',
    toolName: 'run_js',
    type: 'dynamic-tool',
    ...overrides,
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}
