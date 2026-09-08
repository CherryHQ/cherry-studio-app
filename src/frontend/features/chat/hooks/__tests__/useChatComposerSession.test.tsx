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

function Probe({ draftHandoff, onChange, target }: ProbeProps) {
  const value = useChatComposerSession(target, draftHandoff);

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

describe('useChatComposerSession', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    composerSession = undefined;
    renderer = undefined;
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
