import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

import type { ToolMessagePart } from '../toolPartState';
import { isWriteFileToolPart, WriteFileToolPart } from '../WriteFileToolPart';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The real component barrel reaches ESM-only packages Jest cannot parse.
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    MessagePart: {
      TextSection: (props: object) => createElement('TextSection', props),
      Tool: (props: object) => createElement('Tool', props),
    },
  };
});

jest.mock('@/frontend/components/FileEntryPreview', () => {
  const { createElement } = jest.requireActual('react');
  return { FileEntryPreview: (props: object) => createElement('FileEntryPreview', props) };
});
jest.mock('../GenericToolPart', () => {
  const { createElement } = jest.requireActual('react');
  return { GenericToolPart: (props: object) => createElement('GenericToolPart', props) };
});

const ENTRY_ID = '00000000-0000-7000-8000-000000000001';

describe('WriteFileToolPart', () => {
  it('claims only write_file parts', () => {
    expect(isWriteFileToolPart(toolPart({ output: {} }))).toBe(true);
    expect(isWriteFileToolPart(toolPart({ output: {}, toolName: 'read_file' }))).toBe(false);
  });

  it('shows a written file as a preview card', () => {
    const renderer = render(
      toolPart({
        output: { status: 'created', fileEntryId: ENTRY_ID, filename: 'report.md', size: 9 },
      }),
    );

    expect(renderer.root.findByType('FileEntryPreview').props.entryId).toBe(ENTRY_ID);
  });

  it('surfaces a rejected write instead of the file card', () => {
    const renderer = render(
      toolPart({ output: { status: 'error', message: 'Invalid filename: ...' } }),
    );

    expect(renderer.root.findAllByType('FileEntryPreview')).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'write-file-tool-part' })).toBeDefined();
  });

  it.each([
    ['a non-object output', 'written'],
    ['an unknown status', { status: 'queued' }],
    ['a malformed entry id', { status: 'created', fileEntryId: 'not-a-uuid' }],
    ['a missing entry id', { status: 'created', filename: 'report.md' }],
  ])('falls back to the generic rendering for %s', (_case, output) => {
    const renderer = render(toolPart({ output }));

    expect(renderer.root.findByType('GenericToolPart')).toBeDefined();
    expect(renderer.root.findAllByType('FileEntryPreview')).toHaveLength(0);
  });

  it('falls back to the generic rendering while the write is still running', () => {
    const renderer = render(
      toolPart({ input: { filename: 'report.md' }, state: 'input-available' }),
    );

    expect(renderer.root.findByType('GenericToolPart')).toBeDefined();
  });
});

function render(part: ToolMessagePart): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<WriteFileToolPart part={part} />);
  });
  return renderer;
}

function toolPart(overrides: Partial<Record<string, unknown>>): ToolMessagePart {
  return {
    input: {},
    state: 'output-available',
    toolCallId: 'call-1',
    toolName: 'write_file',
    type: 'dynamic-tool',
    ...overrides,
  } as Extract<CherryMessagePart, { type: 'dynamic-tool' }>;
}
