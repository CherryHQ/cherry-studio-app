import { StrictMode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { ComposerTestProvider } from '@/frontend/components/Composer/components/__tests__/_composerTestProvider';
import {
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';

import { useComposerHandoffAppend } from '../useComposerHandoffAppend';

jest.mock('@/frontend/components/Composer', () =>
  jest.requireActual('@/frontend/components/Composer/context/ComposerProvider'),
);

jest.mock('@/frontend/components/Composer/hooks/useComposerPresentation', () => ({
  useComposerPresentation: () => ({ state: {}, actions: {} }),
}));

type HandoffProps = {
  handoff?: ChatComposerHandoff;
  onApplied: (token: string) => void;
  token: string;
};

const existing = attachment('existing');
const first = attachment('first');
let snapshot: ReturnType<typeof useComposerState> | undefined;
let actions: ReturnType<typeof useComposerActions> | undefined;

function Probe() {
  const state = useComposerState();
  const composerActions = useComposerActions();
  useEffect(() => {
    snapshot = state;
    actions = composerActions;
  }, [composerActions, state]);
  return null;
}

function ApplyHandoff({ handoff, onApplied, token }: HandoffProps) {
  useComposerHandoffAppend(token, handoff, onApplied);
  return null;
}

function Harness({ token, ...props }: Omit<HandoffProps, 'token'> & { token?: string }) {
  return (
    <ComposerTestProvider initialAttachments={[existing]} initialDraft="initial">
      <Probe />
      {token ? <ApplyHandoff {...props} token={token} /> : null}
    </ComposerTestProvider>
  );
}

describe('useComposerHandoffAppend', () => {
  let renderer: ReactTestRenderer | undefined;
  const onApplied = jest.fn();

  beforeEach(() => {
    onApplied.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    snapshot = undefined;
    actions = undefined;
  });

  it('appends shared text and files without losing the live draft', () => {
    act(() => {
      renderer = create(<Harness onApplied={onApplied} />);
    });
    act(() => actions?.editDraft('existing draft'));
    const handoff = {
      draft: 'shared text',
      attachments: [first],
    };
    act(() => {
      renderer?.update(<Harness token="share-1" handoff={handoff} onApplied={onApplied} />);
    });
    expect(snapshot?.draft).toBe('existing draft\nshared text');
    expect(snapshot?.attachments).toEqual([existing, first]);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledWith('share-1');
  });

  it('applies a handoff only once when StrictMode replays effects before acknowledgement', () => {
    act(() => {
      renderer = create(
        <StrictMode>
          <Harness
            token="share-1"
            handoff={{ draft: 'shared text', attachments: [first] }}
            onApplied={onApplied}
          />
        </StrictMode>,
      );
    });
    expect(snapshot?.draft).toBe('initial\nshared text');
    expect(snapshot?.attachments).toEqual([existing, first]);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it.each([
    { current: '', incoming: 'shared text', expected: 'shared text' },
    { current: 'existing draft', incoming: '', expected: 'existing draft' },
  ])(
    'preserves text boundaries for "$current" and "$incoming"',
    ({ current, incoming, expected }) => {
      act(() => {
        renderer = create(<Harness onApplied={onApplied} />);
      });
      act(() => actions?.editDraft(current));
      act(() => {
        renderer?.update(
          <Harness
            token="share-1"
            handoff={{ draft: incoming, attachments: [] }}
            onApplied={onApplied}
          />,
        );
      });
      expect(snapshot?.draft).toBe(expected);
      expect(snapshot?.attachments).toEqual([existing]);
    },
  );

  it('acknowledges an expired handoff without changing the mounted draft', () => {
    act(() => {
      renderer = create(<Harness token="expired" onApplied={onApplied} />);
    });
    expect(snapshot?.draft).toBe('initial');
    expect(snapshot?.attachments).toEqual([existing]);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledWith('expired');
  });
});

function attachment(fileEntryId: string): ComposerAttachmentReady {
  return {
    fileEntryId,
    id: fileEntryId,
    kind: 'file',
    mediaType: 'text/plain',
    name: `${fileEntryId}.txt`,
    status: 'ready',
    uri: `file:///managed/${fileEntryId}.txt`,
  };
}
