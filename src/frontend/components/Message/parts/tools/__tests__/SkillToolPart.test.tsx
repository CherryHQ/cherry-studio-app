import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SkillToolPart } from '../SkillToolPart';
import type { ToolMessagePart } from '../toolPartState';

jest.mock('@cherrystudio/app-icons/icons/tool-case', () => () => null);
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../GenericToolPart', () => ({ GenericToolPart: () => null }));
jest.mock('@cherrystudio/ui/components', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    ContextMenuExclusion: MockView,
    // A closed detail reader must not make its contents appear in the transcript.
    MessagePart: { Tool: ({ title }: { title: string }) => <MockText>{title}</MockText> },
  };
});

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer?.unmount()));

const change = {
  before: 'Use the desktop script.',
  after: 'Use the available mobile tool.',
  reason: 'Keep the same steps available on your phone.',
};

function render(output: Record<string, unknown>) {
  const part: ToolMessagePart = {
    type: 'dynamic-tool',
    toolName: 'adapt_skill',
    toolCallId: 'adapt',
    state: 'output-available',
    input: {},
    output: { name: 'meeting-notes', changes: [change], ...output },
  };
  act(() => {
    renderer = create(<SkillToolPart part={part} />);
  });
  return renderer.root.findAllByType(Text).map((text) => text.props.children);
}

test('shows the saved skill, reasons and required next message without opening details', () => {
  const text = render({ status: 'adapted', instructionsLoaded: false });
  expect(text).toEqual(
    expect.arrayContaining([
      'meeting-notes',
      'skills.adaptation.saved',
      change.reason,
      'skills.adaptation.reloadFailed',
      'skills.adaptation.viewChanges',
    ]),
  );
  expect(text).not.toContain(change.before);
  expect(text).not.toContain(change.after);
});

test('keeps a declined proposal distinct from saved changes', () => {
  const text = render({ status: 'unchanged' });
  expect(text).toContain('skills.adaptation.unchanged');
  expect(text).toContain('skills.adaptation.viewProposal');
  expect(text).not.toContain('skills.adaptation.saved');
  expect(text).not.toContain(change.reason);
});

test('shows adaptation failures without depending on model prose or opened details', () => {
  const text = render({ status: 'error', code: 'content-changed', message: 'Diagnostic detail' });
  expect(text).toContain('skills.adaptation.failed');
  expect(text).not.toContain('skills.adaptation.saved');
  expect(text).not.toContain('Diagnostic detail');
});
