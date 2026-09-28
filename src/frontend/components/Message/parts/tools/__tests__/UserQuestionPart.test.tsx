import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ToolMessagePart } from '../toolPartState';
import { UserQuestionPart } from '../UserQuestionPart';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    ContextMenuExclusion: (props: object) => createElement('Exclusion', props),
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
const texts = (root: ReactTestRenderer['root']) =>
  root.findAllByType(Text).map((node) => node.props.children);

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
  expect(texts(root)).toEqual([
    'Where?',
    'Hangzhou',
    'What?',
    'Food\nNature\nWalking distance',
    'Notes?',
    'chat.question.skipped',
  ]);
});

test('ignores auxiliary selected-option metadata in the persisted result', () => {
  const root = render(
    {
      questions: [
        {
          id: 'first',
          question: 'Where?',
          selection: 'single',
          options: [
            { id: 'a', label: 'Hangzhou' },
            { id: 'b', label: 'Suzhou' },
          ],
        },
      ],
    },
    {
      answers: [{ questionId: 'first', selectedOptionIds: ['b'], text: 'No car', skipped: false }],
      selectedOptions: [{ questionId: 'first', options: [{ id: 'b', label: 'Suzhou' }] }],
    },
  );
  expect(texts(root)).toEqual(['Where?', 'Suzhou\nNo car']);
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
  expect(texts(root)).toEqual(['Where?', 'chat.question.closed', 'Notes?', 'chat.question.closed']);
});
