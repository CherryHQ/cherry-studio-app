import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentChatDraftHandoff } from '../../runtime/agentChatDraftHandoff';
import { type ChatComposerSessionState, useChatComposerSession } from '../useChatComposerSession';

type ProbeProps = {
  draftHandoff?: AgentChatDraftHandoff;
  target: ChatTarget;
};

let composerSession: ChatComposerSessionState | undefined;
let completeAppend: ((token: string) => void) | undefined;

function Probe({ draftHandoff, target }: ProbeProps) {
  const { composerSession: value, completeAppend: complete } = useChatComposerSession(
    target,
    draftHandoff,
  );

  useEffect(() => {
    composerSession = value;
    completeAppend = complete;
  }, [complete, value]);

  return null;
}

describe('useChatComposerSession', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    composerSession = undefined;
    completeAppend = undefined;
    renderer = undefined;
  });

  it('seeds a session composer from a handoff', () => {
    const target = { kind: 'session', sessionId: 'session-1', composerHandoff: 'share-1' } as const;
    act(() => {
      renderer = create(<Probe target={target} />);
    });
    expect(current().seedHandoff).toBe('share-1');
    expect(current().pendingAppend).toBeUndefined();
  });

  it.each([
    { kind: 'session' as const, sessionId: 'session-1' },
    { kind: 'draft' as const, agentId: 'agent-1' },
  ])('appends a same-target handoff to the mounted $kind composer only once', (identity) => {
    const target = { ...identity, composerHandoff: 'share-1' };
    act(() => {
      renderer = create(<Probe target={target} />);
    });
    const originalKey = current().key;
    const nextTarget = { ...target, composerHandoff: 'share-2' };
    act(() => {
      renderer?.update(<Probe target={nextTarget} />);
    });
    expect(current()).toMatchObject({
      key: originalKey,
      seedHandoff: 'share-1',
      pendingAppend: 'share-2',
    });

    act(() => completeAppend?.('share-2'));
    expect(current().pendingAppend).toBeUndefined();
    const completed = current();
    act(() => {
      renderer?.update(<Probe target={{ ...nextTarget }} />);
    });
    expect(current()).toBe(completed);
  });

  it('appends to an unseeded composer and ignores acknowledgement for an older handoff', () => {
    const target = { kind: 'session', sessionId: 'session-1' } as const;
    act(() => {
      renderer = create(<Probe target={target} />);
    });
    const originalKey = current().key;
    for (const composerHandoff of ['share-1', 'share-2']) {
      act(() => {
        renderer?.update(<Probe target={{ ...target, composerHandoff }} />);
      });
    }
    act(() => completeAppend?.('share-1'));
    expect(current().key).toBe(originalKey);
    expect(current().pendingAppend).toBe('share-2');
  });

  it('preserves the Draft composer only for its accepted Session handoff', () => {
    const draftTarget = { agentId: 'agent-1', kind: 'draft' } as const;
    const sessionTarget = { kind: 'session', sessionId: 'session-1' } as const;

    act(() => {
      renderer = create(<Probe target={draftTarget} />);
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(
        <Probe
          draftHandoff={{ agentId: 'agent-1', sessionId: 'session-1' }}
          target={sessionTarget}
        />,
      );
    });

    expect(current()).toEqual({
      draftAgentId: 'agent-1',
      key: draftKey,
      target: sessionTarget,
    });

    act(() => {
      renderer?.update(<Probe target={sessionTarget} />);
    });

    expect(current()).toEqual({
      draftAgentId: 'agent-1',
      key: draftKey,
      target: sessionTarget,
    });
  });

  it('seeds a changed Draft target and keeps it across Agent switches without a handoff', () => {
    const shared = { agentId: 'agent-1', kind: 'draft', composerHandoff: 'share-1' } as const;
    const retargeted = { agentId: 'agent-2', kind: 'draft' } as const;
    const nextShare = { agentId: 'agent-3', kind: 'draft', composerHandoff: 'share-2' } as const;

    act(() => {
      renderer = create(<Probe target={{ agentId: 'agent-0', kind: 'draft' }} />);
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(<Probe target={shared} />);
    });

    expect(current()).toEqual({ key: draftKey + 1, seedHandoff: 'share-1', target: shared });

    // The shared text and attachments belong to the user, not to the Agent they arrived under.
    act(() => {
      renderer?.update(<Probe target={retargeted} />);
    });

    expect(current()).toEqual({ key: draftKey + 1, seedHandoff: 'share-1', target: retargeted });

    act(() => {
      renderer?.update(<Probe target={nextShare} />);
    });

    expect(current()).toEqual({ key: draftKey + 2, seedHandoff: 'share-2', target: nextShare });
  });

  it('seeds a fresh composer when a handoff targets another Session', () => {
    act(() => {
      renderer = create(<Probe target={{ kind: 'session', sessionId: 'session-1' }} />);
    });
    const originalKey = current().key;
    const target = { kind: 'session', sessionId: 'session-2', composerHandoff: 'share-1' } as const;
    act(() => {
      renderer?.update(<Probe target={target} />);
    });
    expect(current()).toMatchObject({ key: originalKey + 1, seedHandoff: 'share-1' });
    expect(current().pendingAppend).toBeUndefined();
  });

  it('starts a fresh composer for every unrelated chat identity', () => {
    const draftTarget = { agentId: 'agent-1', kind: 'draft' } as const;
    const firstSessionTarget = { kind: 'session', sessionId: 'session-1' } as const;
    const secondSessionTarget = { kind: 'session', sessionId: 'session-2' } as const;

    act(() => {
      renderer = create(<Probe target={draftTarget} />);
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(
        <Probe
          draftHandoff={{ agentId: 'agent-2', sessionId: 'session-1' }}
          target={firstSessionTarget}
        />,
      );
    });

    expect(current()).toEqual({ key: draftKey + 1, target: firstSessionTarget });

    act(() => {
      renderer?.update(<Probe target={secondSessionTarget} />);
    });

    expect(current()).toEqual({ key: draftKey + 2, target: secondSessionTarget });

    act(() => {
      renderer?.update(<Probe target={draftTarget} />);
    });

    expect(current()).toEqual({ key: draftKey + 3, target: draftTarget });
  });

  it.each([
    { kind: 'session' as const, sessionId: 'session-1' },
    { kind: 'draft' as const, agentId: 'agent-1', composerHandoff: 'seed-1' },
  ])('keeps the mounted $kind composer when a preview selection arrives', (target) => {
    act(() => {
      renderer = create(<Probe target={target} />);
    });
    const original = current();
    act(() => {
      renderer?.update(<Probe target={{ ...target, selectionHandoff: 'selection-1' }} />);
    });
    expect(current()).toBe(original);
  });
});

function current() {
  if (!composerSession) {
    throw new Error('useChatComposerSession probe was not rendered.');
  }

  return composerSession;
}
