import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ComposerSessionProvider,
  ComposerSurface,
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer';
import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';

import { usePaintingAnnotationDraft } from '../usePaintingAnnotationDraft';

let mockSend: () => Promise<void>;
const mockGenerate = jest.fn<Promise<unknown>, [PaintingInputSubmission]>();
const mockClose = jest.fn();
const mockAnnotationsChange = jest.fn();
const notes = [
  { id: 1, x: 0.3, y: 0.4, text: 'Make the cup blue' },
  { id: 2, x: 0.7, y: 0.5, text: 'Soften the shadow' },
];
const input: PaintingInputSubmission = {
  attachments: [],
  mode: 'edit',
  modelId: 'provider::image',
  modelName: 'Image model',
  paramValues: {},
  prompt: '',
};

jest.mock('@/frontend/components/Composer', () => {
  const context = jest.requireActual('@/frontend/components/Composer/context/ComposerProvider');
  return {
    ...context,
    // File importing is unrelated to this draft protocol; retain the real session and surface.
    ComposerSessionProvider: jest.requireActual(
      '@/frontend/components/Composer/components/__tests__/_composerTestProvider',
    ).ComposerTestProvider,
    ComposerSurface: jest.requireActual('@/frontend/components/Composer/components/ComposerSurface')
      .ComposerSurface,
  };
});
jest.mock('@cherrystudio/ui/components', () => ({
  Composer: ({ onSend }: { onSend: () => Promise<void> }) => {
    mockSend = onSend;
    return null;
  },
  useToast: () => ({ toast: { show: jest.fn() } }),
  useComposerExpansion: () => null,
  useAlert: () => ({ alert: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), warn: jest.fn() }),
  },
}));

let editing: ReturnType<typeof usePaintingAnnotationDraft>;
let composer: ReturnType<typeof useComposerState>;
let actions: ReturnType<typeof useComposerActions>;
function Probe() {
  const current = usePaintingAnnotationDraft({
    initialAnnotations: notes,
    onAnnotationsChange: mockAnnotationsChange,
    onClose: mockClose,
    onGenerate: mockGenerate,
  });
  const state = useComposerState();
  const controls = useComposerActions();
  useLayoutEffect(() => {
    editing = current;
    composer = state;
    actions = controls;
  });
  return (
    <ComposerSurface
      onSend={async ({ text }) => {
        const prepared = current.preparePrompt(text);
        await current.generate({ ...input, ...prepared });
      }}
      onStop={() => undefined}
      streaming={false}
    />
  );
}

describe('painting annotation submission', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(
        <ComposerSessionProvider initialDraft="Keep the composition">
          <Probe />
        </ComposerSessionProvider>,
      );
    });
    act(() => editing.selectAnnotation(1));
  });
  afterEach(() => act(() => renderer.unmount()));

  it('keeps the selected note through clearing and failed-send recovery', async () => {
    const pending = deferred<unknown>();
    mockGenerate.mockReturnValueOnce(pending.promise);
    let sending!: Promise<void>;
    act(() => {
      sending = mockSend();
    });
    expect(composer.draft).toBe('');
    expect(editing.isSubmitting).toBe(true);

    act(() => {
      editing.selectAnnotation(2);
      editing.selectAnnotation(null);
      editing.addAnnotation(0.5, 0.5);
      editing.removeSelectedAnnotation();
      editing.close();
    });
    expect(editing.selectedId).toBe(1);
    expect(editing.annotations).toEqual(notes);
    expect(mockClose).not.toHaveBeenCalled();
    act(() => actions.setDraft('Keep the handle'));

    await act(async () => {
      pending.reject(new Error('request rejected'));
      await sending;
    });
    expect(editing.isSubmitting).toBe(false);
    expect(editing.selectedId).toBe(1);
    expect(composer.draft).toBe('Make the cup blue\nKeep the handle');

    act(() => editing.selectAnnotation(2));
    expect(editing.annotations).toEqual([
      { ...notes[0], text: 'Make the cup blue\nKeep the handle' },
      notes[1],
    ]);
    expect(composer.draft).toBe('Soften the shadow');
    act(() => editing.close());
    expect(composer.draft).toBe('Keep the composition');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'closes an accepted editor only without newer input (edited: %s)',
    async (edited) => {
      const pending = deferred<unknown>();
      mockGenerate.mockReturnValueOnce(pending.promise);
      let sending!: Promise<void>;
      act(() => {
        sending = mockSend();
      });
      if (edited) act(() => actions.setDraft('A newer instruction'));
      await act(async () => {
        pending.resolve({ paintingId: 'new-painting' });
        await sending;
      });
      expect(editing.isSubmitting).toBe(false);
      expect(editing.annotations).toEqual(notes);
      expect(mockClose).toHaveBeenCalledTimes(edited ? 0 : 1);
      expect(composer.draft).toBe(edited ? 'A newer instruction' : '');
    },
  );

  it('does not close a replacement editor when an unmounted submission is accepted', async () => {
    const pending = deferred<unknown>();
    mockGenerate.mockReturnValueOnce(pending.promise);
    let sending!: Promise<void>;
    act(() => {
      sending = mockSend();
    });
    act(() => {
      renderer.update(
        <ComposerSessionProvider>
          <Probe key="replacement" />
        </ComposerSessionProvider>,
      );
    });
    await act(async () => {
      pending.resolve({ paintingId: 'new-painting' });
      await sending;
    });
    expect(mockClose).not.toHaveBeenCalled();
    expect(editing.isSubmitting).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
