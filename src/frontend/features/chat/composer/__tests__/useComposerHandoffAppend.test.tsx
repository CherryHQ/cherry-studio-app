import { StrictMode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import {
  ComposerProvider,
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import { useManagedComposerAttachments } from '@/frontend/components/Composer/hooks/useManagedComposerAttachments';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';

import { useComposerHandoffAppend } from '../useComposerHandoffAppend';

jest.mock('@/frontend/components/Composer', () =>
  jest.requireActual('@/frontend/components/Composer/context/ComposerProvider'),
);

jest.mock('@/frontend/components/Composer/hooks/useComposerPresentation', () => ({
  useComposerPresentation: () => ({ state: {}, actions: {} }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({}),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

type ProbeProps = {
  handoff?: ChatComposerHandoff;
  onApplied: (token: string) => void;
  token?: string;
};

const existing = attachment('existing');
const first = attachment('first');
const second = attachment('second');
let snapshot: ReturnType<typeof useComposerState> | undefined;
let actions: ReturnType<typeof useComposerActions> | undefined;

function Probe({ handoff, onApplied, token }: ProbeProps) {
  useComposerHandoffAppend(token, handoff, onApplied);
  const state = useComposerState();
  const composerActions = useComposerActions();
  useEffect(() => {
    snapshot = state;
    actions = composerActions;
  }, [composerActions, state]);
  return null;
}

function Harness(props: ProbeProps) {
  const attachmentStore = useManagedComposerAttachments([existing]);
  return (
    <ComposerProvider attachmentStore={attachmentStore} initialDraft="initial">
      <Probe {...props} />
    </ComposerProvider>
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

  it('appends to the live draft and preserves attachment arrival order without duplicate files', () => {
    act(() => {
      renderer = create(<Harness onApplied={onApplied} />);
    });
    act(() => actions?.editDraft('existing draft'));
    const handoff = {
      draft: 'shared text',
      attachments: [
        first,
        { ...existing, id: 'reselected-existing' },
        second,
        { ...first, id: 'duplicate-first' },
      ],
    };
    act(() => {
      renderer?.update(<Harness token="share-1" handoff={handoff} onApplied={onApplied} />);
    });
    expect(snapshot?.draft).toBe('existing draft\nshared text');
    expect(snapshot?.attachments).toEqual([existing, first, second]);
    expect(onApplied).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledWith('share-1');

    // A route replay after another user edit must neither append again nor replace that edit.
    act(() => actions?.editDraft('edited after sharing'));
    act(() => {
      renderer?.update(<Harness token="share-1" handoff={{ ...handoff }} onApplied={onApplied} />);
    });
    expect(snapshot?.draft).toBe('edited after sharing');
    expect(snapshot?.attachments).toEqual([existing, first, second]);
    expect(onApplied).toHaveBeenCalledTimes(1);

    act(() => {
      renderer?.update(
        <Harness
          token="share-2"
          handoff={{ draft: 'next share', attachments: [second] }}
          onApplied={onApplied}
        />,
      );
    });
    expect(snapshot?.draft).toBe('edited after sharing\nnext share');
    expect(snapshot?.attachments).toEqual([existing, first, second]);
    expect(onApplied).toHaveBeenCalledTimes(2);
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

  it('keeps the current draft and attachments when there is no pending handoff', () => {
    act(() => {
      renderer = create(<Harness onApplied={onApplied} />);
    });
    act(() => actions?.editDraft('unsent draft'));
    act(() => {
      renderer?.update(<Harness onApplied={onApplied} />);
    });
    expect(snapshot?.draft).toBe('unsent draft');
    expect(snapshot?.attachments).toEqual([existing]);
    expect(onApplied).not.toHaveBeenCalled();
  });

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
