import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ToolMessagePart } from '../toolPartState';
import { UserQuestionPart } from '../UserQuestionPart';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ContextMenuExclusion: (props: object) => createElement('Exclusion', props),
    MessagePart: {
      Tool: (props: object) => createElement('Tool', props),
      TextSection: (props: object) => createElement('TextSection', props),
    },
  };
});
jest.mock('../GenericToolPart', () => ({ GenericToolPart: () => null }));

let renderer: ReactTestRenderer;
afterEach(() => {
  act(() => renderer.unmount());
});
function render(input: unknown, output: unknown) {
  const part = {
    type: 'dynamic-tool',
    toolName: 'ask_user_question',
    toolCallId: 'call',
    state: 'output-available',
    input,
    output,
  } as ToolMessagePart;
  act(() => {
    renderer = create(<UserQuestionPart part={part} />);
  });
  return renderer.root;
}

test('shows all questions with the answers bound by ID, including a skipped question', () => {
  const root = render(
    {
      questions: [
        {
          id: 'first',
          question: 'Where?',
          selection: 'single',
          options: [{ id: 'a', label: 'Hangzhou' }],
        },
        {
          id: 'second',
          question: 'What?',
          selection: 'multiple',
          options: [
            { id: 'a', label: 'Food' },
            { id: 'b', label: 'Nature' },
          ],
        },
        { id: 'third', question: 'Notes?', selection: 'single', options: [] },
      ],
    },
    {
      answers: [
        { questionId: 'third', selectedOptionIds: [], text: '', skipped: true },
        {
          questionId: 'second',
          selectedOptionIds: ['b', 'a'],
          text: 'Walking distance',
          skipped: false,
        },
        { questionId: 'first', selectedOptionIds: ['a'], text: '', skipped: false },
      ],
    },
  );
  expect(root.findByType('Tool').props.statusText).toBe('common.done');
  expect(root.findAllByType('TextSection').map((node) => node.props.value)).toEqual([
    'Hangzhou',
    'Food\n\nNature\n\nWalking distance',
  ]);
  const text = JSON.stringify(renderer.toJSON());
  for (const expected of ['Where?', 'What?', 'Notes?', 'chat.question.skipped'])
    expect(text).toContain(expected);
});

test('reads legacy results and ignores auxiliary selected-option metadata', () => {
  const root = render(
    {
      question: 'Where?',
      selection: 'single',
      options: [
        { id: 'a', label: 'Hangzhou', description: 'Old description' },
        { id: 'b', label: 'Suzhou', description: '' },
      ],
    },
    { selectedOptionIds: ['b'], text: 'No car', skipped: false, selectedOptions: [] },
  );
  expect(root.findByType('TextSection').props.value).toBe('Suzhou\n\nNo car');
});

test('does not present incomplete persisted answers as completed', () => {
  const root = render(
    {
      questions: [
        { id: 'first', question: 'Where?', selection: 'single', options: [] },
        { id: 'second', question: 'Notes?', selection: 'single', options: [] },
      ],
    },
    { answers: [{ questionId: 'first', selectedOptionIds: [], text: 'Hangzhou', skipped: false }] },
  );
  expect(root.findByType('Tool').props.statusText).toBe('chat.question.closed');
  expect(root.findAllByType('TextSection')).toHaveLength(0);
});
