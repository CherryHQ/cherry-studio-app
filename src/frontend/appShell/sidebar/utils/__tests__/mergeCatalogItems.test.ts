import type { AgentRef, AgentSummary, ConversationSummary } from '@/frontend/appShell/conversation';

import { mergeCatalogAgents, mergeCatalogSessions } from '../mergeCatalogItems';

function makeAgent(id: string, kind: 'local' | 'team'): AgentSummary {
  const source =
    kind === 'team'
      ? ({ kind: 'team', bindingId: 'binding-1' } as const)
      : ({ kind: 'local' } as const);
  return {
    ref: `${kind}:${id}` as AgentRef,
    source,
    id,
    name: `Agent ${id}`,
    configuration: kind === 'team' ? 'unknown' : 'available',
  };
}

function makeSession(
  id: string,
  kind: 'local' | 'team',
  dates: { updatedAt?: string; createdAt?: string } = {},
): ConversationSummary {
  const source =
    kind === 'team'
      ? ({ kind: 'team', bindingId: 'binding-1' } as const)
      : ({ kind: 'local' } as const);
  return {
    ref: { source, sessionId: id },
    title: `Session ${id}`,
    ...dates,
  };
}

describe('mergeCatalogItems', () => {
  it('merges local agents before team agents in order', () => {
    const local = [makeAgent('local-1', 'local'), makeAgent('local-2', 'local')];
    const team = [makeAgent('team-1', 'team')];

    expect(mergeCatalogAgents(local, team).map((agent) => agent.id)).toEqual([
      'local-1',
      'local-2',
      'team-1',
    ]);
  });

  it('sorts merged sessions descending by updatedAt with createdAt fallback', () => {
    const local = [
      makeSession('l-old', 'local', { createdAt: '2026-11-27T08:00:00Z' }),
      makeSession('l-new', 'local', { updatedAt: '2026-11-27T11:00:00Z' }),
    ];
    const team = [
      makeSession('t-mid', 'team', {
        createdAt: '2026-11-27T09:00:00Z',
        updatedAt: '2026-11-27T10:00:00Z',
      }),
    ];

    expect(mergeCatalogSessions(local, team).map((session) => session.ref.sessionId)).toEqual([
      'l-new',
      't-mid',
      'l-old',
    ]);
  });

  it('breaks equal timestamp ties with local sessions first and keeps undated items last in order', () => {
    const timestamp = '2026-11-27T10:00:00Z';
    const local = [
      makeSession('l-undated', 'local'),
      makeSession('l-tie', 'local', { updatedAt: timestamp }),
    ];
    const team = [
      makeSession('t-tie', 'team', { updatedAt: timestamp }),
      makeSession('t-undated', 'team'),
    ];

    expect(mergeCatalogSessions(local, team).map((session) => session.ref.sessionId)).toEqual([
      'l-tie',
      't-tie',
      'l-undated',
      't-undated',
    ]);
  });
});
