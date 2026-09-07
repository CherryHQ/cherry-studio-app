import { createChatInputSubmission } from '../chatInputSubmission';

const input = {
  sessionId: 'session-1',
  mode: 'steer' as const,
  targetTurnId: 'turn-1',
  parts: [{ type: 'text' as const, text: 'Change direction' }],
};

test('retries the same intent once and allocates another identity after acceptance', () => {
  const submission = createChatInputSubmission();
  const first = submission.identify(input);
  expect(submission.identify(JSON.parse(JSON.stringify(input)))).toBe(first);
  submission.accept(first);
  expect(submission.identify(input)).not.toBe(first);
});

test('changing the target, content, or model creates a distinct submission', () => {
  const submission = createChatInputSubmission();
  const first = submission.identify(input);
  const second = submission.identify({ ...input, targetTurnId: 'turn-2' });
  const third = submission.identify({ ...input, parts: [{ type: 'text', text: 'New request' }] });
  const fourth = submission.identify({ ...input, modelId: 'provider::another-model' });
  expect(new Set([first, second, third, fourth]).size).toBe(4);
  submission.accept(first);
  expect(submission.identify({ ...input, modelId: 'provider::another-model' })).toBe(fourth);
});
