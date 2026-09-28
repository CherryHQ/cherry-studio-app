import {
  AgentRespondQuestionSchema,
  AgentUserQuestionRequestSchema,
  AgentUserQuestionsSchema,
  getUserQuestions,
  validateUserResponse,
  type AgentUserQuestions,
} from '../agent';

const request: AgentUserQuestions = {
  questions: [
    {
      id: 'destination',
      question: 'Choose',
      selection: 'single',
      options: [{ id: 'city', label: 'City' }],
    },
    {
      id: 'experience',
      question: 'Choose',
      selection: 'multiple',
      options: [
        { id: 'food', label: 'Food' },
        { id: 'nature', label: 'Nature' },
      ],
    },
    { id: 'notes', question: 'Anything else?', selection: 'single', options: [] },
  ],
};
const answers = [
  { questionId: 'notes', selectedOptionIds: [], text: 'No car', skipped: false },
  { questionId: 'destination', selectedOptionIds: ['city'], text: '', skipped: false },
  {
    questionId: 'experience',
    selectedOptionIds: ['food', 'nature'],
    text: 'Walking distance',
    skipped: false,
  },
];

test('correlates mixed answers by ID even when prompts repeat and answers arrive out of order', () => {
  const parsed = AgentUserQuestionsSchema.parse(request);
  const response = AgentRespondQuestionSchema.parse({
    sessionId: 'session',
    turnId: 'turn',
    toolCallId: 'call',
    answer: { answers },
  });
  expect(() => validateUserResponse(parsed, response.answer)).not.toThrow();
  expect(() =>
    validateUserResponse(parsed, {
      answers: [answers[0], { ...answers[1], selectedOptionIds: ['food'] }, answers[2]],
    }),
  ).toThrow();
});

test.each(
  [
    answers.slice(0, 2),
    [answers[0], answers[1], answers[1]],
    [{ ...answers[0], questionId: 'unknown' }, answers[1], answers[2]],
    [{ ...answers[0], text: '   ' }, answers[1], answers[2]],
    [answers[0], answers[1], { ...answers[2], skipped: true }],
    [answers[0], answers[1], { ...answers[2], selectedOptionIds: ['food', 'food'] }],
  ].map((invalid) => [invalid] as const),
)('rejects partial, duplicate, unknown and invalid question answers: %j', (invalid) => {
  expect(() => validateUserResponse(request, { answers: invalid })).toThrow();
});

test('requires an explicit empty skipped answer and keeps the legacy wire format compatible', () => {
  expect(() =>
    validateUserResponse(request, {
      answers: answers.map((answer) => ({
        ...answer,
        selectedOptionIds: [],
        text: '',
        skipped: true,
      })),
    }),
  ).not.toThrow();
  const legacy = {
    question: 'Choose',
    selection: 'single',
    options: [
      { id: 'a', label: 'A', description: 'Old description' },
      { id: 'b', label: 'B', description: '' },
    ],
  };
  const parsed = AgentUserQuestionRequestSchema.parse(legacy);
  expect(getUserQuestions(parsed)[0]).toMatchObject({ id: 'question-1', question: 'Choose' });
  expect(() =>
    validateUserResponse(parsed, { selectedOptionIds: ['a'], text: '', skipped: false }),
  ).not.toThrow();
  expect(() => validateUserResponse(parsed, { answers })).toThrow();
  expect(() =>
    validateUserResponse(request, { selectedOptionIds: ['city'], text: '', skipped: false }),
  ).toThrow();
});

test('bounds the model input and rejects ambiguous question or option identities', () => {
  expect(AgentUserQuestionsSchema.safeParse(request).success).toBe(true);
  expect(AgentUserQuestionsSchema.safeParse({ questions: [] }).success).toBe(false);
  expect(
    AgentUserQuestionsSchema.safeParse({
      questions: Array.from({ length: 9 }, (_, i) => ({ ...request.questions[0], id: String(i) })),
    }).success,
  ).toBe(false);
  expect(
    AgentUserQuestionsSchema.safeParse({ questions: [request.questions[0], request.questions[0]] })
      .success,
  ).toBe(false);
  expect(
    AgentUserQuestionsSchema.safeParse({
      questions: [
        {
          ...request.questions[0],
          options: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        },
      ],
    }).success,
  ).toBe(false);
});
