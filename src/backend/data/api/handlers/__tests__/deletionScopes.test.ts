import { installTestHost, uninstallTestHost } from '@/backend/core/application/testHost';
import { ResourceScopeCoordinator } from '@/backend/core/resources/ResourceScopeCoordinator';
import type { ResourceScope } from '@/backend/core/resources/types';
import { ScopeFencedError } from '@/backend/core/resources/types';
import type { AssistantService } from '@/backend/data/services/AssistantService';
import type { MessageService } from '@/backend/data/services/MessageService';
import type { PaintingService } from '@/backend/data/services/PaintingService';
import type { TopicService } from '@/backend/data/services/TopicService';

import { createAssistantHandlers } from '../assistants';
import { createMessageHandlers } from '../messages';
import { createPaintingHandlers } from '../paintings';
import { createTopicHandlers } from '../topics';

// The assistant route reaches the topic singleton directly — it is the only
// handler here that does not receive its collaborator — so the id set it
// cascades over is stubbed rather than read from a database.
jest.mock('@/backend/data/services/TopicService', () => ({
  topicService: { listIdsByAssistantId: async () => ['topic-1', 'topic-2'] },
}));

/**
 * The Data API is the boundary every deletion crosses, so this asserts the one
 * property that cannot be tested from either side alone: that each DELETE route
 * cancels the work under its resource and waits for it, before the mutation the
 * route exists to perform.
 */
describe('Data API deletion scopes', () => {
  let scopes: ResourceScopeCoordinator;
  /** Whatever the route ran, recorded in the order the coordinator drove it. */
  let trace: string[];

  beforeEach(async () => {
    scopes = new ResourceScopeCoordinator();
    trace = [];
    await installTestHost({ ResourceScopeCoordinator: scopes });
  });

  afterEach(uninstallTestHost);

  /** Work that stops only when asked, and settles a tick after it is asked. */
  function registerWork(...targets: ResourceScope[]) {
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    scopes.register({
      cancel: () => {
        trace.push('cancel');
        setTimeout(() => {
          trace.push('settled');
          finish();
        }, 0);
      },
      kind: 'test.work',
      scopes: targets,
      settled,
    });
  }

  const mutation = (label: string) => async () => {
    trace.push(label);
  };

  describe('topics', () => {
    function handlers(overrides: Partial<TopicService> = {}) {
      return createTopicHandlers({
        delete: jest.fn(mutation('delete')),
        deleteByAssistantId: jest.fn(mutation('deleteByAssistantId')),
        deleteByIds: jest.fn(mutation('deleteByIds')),
        listIdsByAssistantId: jest.fn(async () => ['topic-1', 'topic-2']),
        ...overrides,
      } as unknown as TopicService);
    }

    it('drains a single topic before deleting it', async () => {
      registerWork({ id: 'topic-1', kind: 'topic' });

      await handlers()['/topics/:id'].DELETE({ params: { id: 'topic-1' } });

      expect(trace).toEqual(['cancel', 'settled', 'delete']);
    });

    it('drains every topic in a batch before deleting any', async () => {
      registerWork({ id: 'topic-2', kind: 'topic' });

      await handlers()['/topics'].DELETE({ query: { ids: ['topic-1', 'topic-2'] } });

      expect(trace).toEqual(['cancel', 'settled', 'deleteByIds']);
    });

    it("resolves an assistant's topic ids before cascading, so their work is cancelled too", async () => {
      // The cascade discovers its own ids inside the write transaction, which is
      // too late — the route has to read them first or cancel nothing.
      registerWork({ id: 'topic-2', kind: 'topic' });

      await handlers()['/assistants/:assistantId/topics'].DELETE({
        params: { assistantId: 'assistant-1' },
      });

      expect(trace).toEqual(['cancel', 'settled', 'deleteByAssistantId']);
    });

    it('drains an assistant’s topics when deleting the assistant cascades into them', async () => {
      registerWork({ id: 'topic-2', kind: 'topic' });

      await createAssistantHandlers({
        delete: jest.fn(mutation('deleteAssistant')),
      } as unknown as AssistantService)['/assistants/:id'].DELETE({
        params: { id: 'assistant-1' },
        query: { deleteTopics: true },
      });

      expect(trace).toEqual(['cancel', 'settled', 'deleteAssistant']);
    });

    it('leaves the topics alone when the assistant is deleted without them', async () => {
      registerWork({ id: 'topic-2', kind: 'topic' });

      await createAssistantHandlers({
        delete: jest.fn(mutation('deleteAssistant')),
      } as unknown as AssistantService)['/assistants/:id'].DELETE({
        params: { id: 'assistant-1' },
        query: {},
      });

      // The topics survive, so the work running under them must not be touched.
      expect(trace).toEqual(['deleteAssistant']);
    });

    it('seals a deleted topic so nothing can register against it again', async () => {
      await handlers()['/topics/:id'].DELETE({ params: { id: 'topic-1' } });

      expect(() =>
        scopes.register({
          cancel: () => undefined,
          kind: 'chat.turn',
          scopes: [{ id: 'topic-1', kind: 'topic' }],
          settled: Promise.resolve(),
        }),
      ).toThrow(ScopeFencedError);
    });
  });

  describe('messages', () => {
    function handlers() {
      return createMessageHandlers({
        clearTopicMessages: jest.fn(mutation('clearTopicMessages')),
        getById: jest.fn(async () => ({ id: 'message-1', topicId: 'topic-1' })),
      } as unknown as MessageService);
    }

    it('drains before clearing a topic, then leaves the topic usable', async () => {
      registerWork({ id: 'topic-1', kind: 'topic' });

      await handlers()['/topics/:topicId/messages'].DELETE({ params: { topicId: 'topic-1' } });

      expect(trace).toEqual(['cancel', 'settled', 'clearTopicMessages']);
      // Invalidated, not deleted: the topic survives, so it reopens.
      expect(() =>
        scopes.register({
          cancel: () => undefined,
          kind: 'chat.turn',
          scopes: [{ id: 'topic-1', kind: 'topic' }],
          settled: Promise.resolve(),
        }),
      ).not.toThrow();
    });
  });

  describe('paintings', () => {
    it('drains the generate jobs before deleting the receipts', async () => {
      registerWork({ id: 'painting-1', kind: 'painting' });
      const service = {
        deleteMany: jest.fn(mutation('deleteMany')),
      } as unknown as PaintingService;

      await createPaintingHandlers(service)['/paintings'].DELETE({
        query: { ids: ['painting-1'] },
      });

      expect(trace).toEqual(['cancel', 'settled', 'deleteMany']);
    });
  });
});
