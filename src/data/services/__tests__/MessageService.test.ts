import type { Message } from '@/data/types/message';
import { MessageService } from '../MessageService';

jest.mock('@/data/db/schemas', () => ({
  messageTable: {},
  topicTable: {},
}));

describe('MessageService', () => {
  test('reserveAssistantTurn delegates to createUserMessageWithPlaceholders', async () => {
    const service = new MessageService({} as never, {} as never);
    const result = {
      placeholders: [createMessage('650e8400-e29b-41d4-a716-446655440000', 'assistant')],
      userMessage: createMessage('550e8400-e29b-41d4-a716-446655440000', 'user'),
    };
    const input = {
      placeholders: [
        {
          data: { parts: [] },
          role: 'assistant' as const,
        },
      ],
      topicId: '750e8400-e29b-41d4-a716-446655440000',
      userMessage: {
        dto: {
          data: { parts: [] },
          role: 'user' as const,
        },
        mode: 'create' as const,
      },
    };
    const createTurn = jest
      .spyOn(service, 'createUserMessageWithPlaceholders')
      .mockResolvedValue(result);

    await expect(service.reserveAssistantTurn(input)).resolves.toBe(result);
    expect(createTurn).toHaveBeenCalledWith(input);
  });
});

function createMessage(id: string, role: Message['role']): Message {
  const now = '2026-05-15T00:00:00.000Z';

  return {
    createdAt: now,
    data: { parts: [] },
    id,
    parentId: null,
    role,
    searchableText: '',
    siblingsGroupId: 0,
    status: 'pending',
    topicId: '750e8400-e29b-41d4-a716-446655440000',
    updatedAt: now,
  };
}
