import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentChatDraftHandoff } from '../../runtime/agentChatDraftHandoff';
import { type ChatComposerSessionState, useChatComposerSession } from '../useChatComposerSession';

type ProbeProps = {
  draftHandoff?: AgentChatDraftHandoff;
  onChange: (value: ChatComposerSessionState) => void;
  target: ChatTarget;
};

let composerSession: ChatComposerSessionState | undefined;
let completeAppend: ((token: string) => void) | undefined;

function Probe({ draftHandoff, onChange, target }: ProbeProps) {
  const { composerSession: value, completeAppend: complete } = useChatComposerSession(
    target,
    draftHandoff,
  );

  useEffect(() => {
    onChange(value);
    completeAppend = complete;
  }, [complete, onChange, value]);

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
      renderer = create(<Probe onChange={captureComposerSession} target={target} />);
    });
    expect(current()).toEqual({ key: 0, seedHandoff: 'share-1', target });
  });

  it.each([
    { kind: 'session' as const, sessionId: 'session-1' },
    { kind: 'draft' as const, agentId: 'agent-1' },
  ])('appends a same-target handoff to the mounted $kind composer only once', (identity) => {
    const target = { ...identity, composerHandoff: 'share-1' };
    act(() => {
      renderer = create(<Probe onChange={captureComposerSession} target={target} />);
    });
    const originalKey = current().key;
    const nextTarget = { ...target, composerHandoff: 'share-2' };
    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={nextTarget} />);
    });
    expect(current()).toEqual({
      key: originalKey,
      seedHandoff: 'share-1',
      appendHandoff: 'share-2',
      pendingAppend: 'share-2',
      target: nextTarget,
    });

    act(() => completeAppend?.('share-2'));
    expect(current()).toEqual({
      key: originalKey,
      seedHandoff: 'share-1',
      appendHandoff: 'share-2',
      target: nextTarget,
    });
    const completed = current();
    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={{ ...nextTarget }} />);
    });
    expect(current()).toBe(completed);
  });

  it('appends to an unseeded composer and ignores acknowledgement for an older handoff', () => {
    const target = { kind: 'session', sessionId: 'session-1' } as const;
    act(() => {
      renderer = create(<Probe onChange={captureComposerSession} target={target} />);
    });
    const originalKey = current().key;
    for (const composerHandoff of ['share-1', 'share-2']) {
      act(() => {
        renderer?.update(
          <Probe onChange={captureComposerSession} target={{ ...target, composerHandoff }} />,
        );
      });
    }
    act(() => completeAppend?.('share-1'));
    expect(current()).toEqual({
      key: originalKey,
      appendHandoff: 'share-2',
      pendingAppend: 'share-2',
      target: { ...target, composerHandoff: 'share-2' },
    });
  });

  it('preserves the Draft composer only for its accepted Session handoff', () => {
    const draftTarget = { agentId: 'agent-1', kind: 'draft' } as const;
    const sessionTarget = { kind: 'session', sessionId: 'session-1' } as const;

    act(() => {
      renderer = create(<Probe onChange={captureComposerSession} target={draftTarget} />);
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(
        <Probe
          draftHandoff={{ agentId: 'agent-1', sessionId: 'session-1' }}
          onChange={captureComposerSession}
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
      renderer?.update(<Probe onChange={captureComposerSession} target={sessionTarget} />);
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
      renderer = create(
        <Probe onChange={captureComposerSession} target={{ agentId: 'agent-0', kind: 'draft' }} />,
      );
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={shared} />);
    });

    expect(current()).toEqual({ key: draftKey + 1, seedHandoff: 'share-1', target: shared });

    // The shared text and attachments belong to the user, not to the Agent they arrived under.
    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={retargeted} />);
    });

    expect(current()).toEqual({ key: draftKey + 1, seedHandoff: 'share-1', target: retargeted });

    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={nextShare} />);
    });

    expect(current()).toEqual({ key: draftKey + 2, seedHandoff: 'share-2', target: nextShare });
  });

  it('seeds a fresh composer when a handoff targets another Session', () => {
    act(() => {
      renderer = create(
        <Probe
          onChange={captureComposerSession}
          target={{ kind: 'session', sessionId: 'session-1' }}
        />,
      );
    });
    const originalKey = current().key;
    const target = { kind: 'session', sessionId: 'session-2', composerHandoff: 'share-1' } as const;
    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={target} />);
    });
    expect(current()).toEqual({ key: originalKey + 1, seedHandoff: 'share-1', target });
  });

  it('starts a fresh composer for every unrelated chat identity', () => {
    const draftTarget = { agentId: 'agent-1', kind: 'draft' } as const;
    const firstSessionTarget = { kind: 'session', sessionId: 'session-1' } as const;
    const secondSessionTarget = { kind: 'session', sessionId: 'session-2' } as const;

    act(() => {
      renderer = create(<Probe onChange={captureComposerSession} target={draftTarget} />);
    });
    const draftKey = current().key;

    act(() => {
      renderer?.update(
        <Probe
          draftHandoff={{ agentId: 'agent-2', sessionId: 'session-1' }}
          onChange={captureComposerSession}
          target={firstSessionTarget}
        />,
      );
    });

    expect(current()).toEqual({ key: draftKey + 1, target: firstSessionTarget });

    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={secondSessionTarget} />);
    });

    expect(current()).toEqual({ key: draftKey + 2, target: secondSessionTarget });

    act(() => {
      renderer?.update(<Probe onChange={captureComposerSession} target={draftTarget} />);
    });

    expect(current()).toEqual({ key: draftKey + 3, target: draftTarget });
  });

  it.each([
    { kind: 'session' as const, sessionId: 'session-1' },
    { kind: 'draft' as const, agentId: 'agent-1', composerHandoff: 'seed-1' },
  ])('keeps the mounted $kind composer when a preview selection arrives', (target) => {
    act(() => {
      renderer = create(<Probe onChange={captureComposerSession} target={target} />);
    });
    const original = current();
    act(() => {
      renderer?.update(
        <Probe
          onChange={captureComposerSession}
          target={{ ...target, selectionHandoff: 'selection-1' }}
        />,
      );
    });
    expect(current()).toBe(original);
  });
});

function captureComposerSession(value: ChatComposerSessionState) {
  composerSession = value;
}

function current() {
  if (!composerSession) {
    throw new Error('useChatComposerSession probe was not rendered.');
  }

  return composerSession;
}
