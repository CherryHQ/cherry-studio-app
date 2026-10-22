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
function Probe({ imageKey }: { imageKey: string | null }) {
  const current = usePaintingAnnotationDraft(imageKey);
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
        await mockGenerate({ ...input, ...prepared });
        if (imageKey) current.clearSubmitted(imageKey);
      }}
      onStop={() => undefined}
      streaming={false}
    />
  );
}

describe('painting annotation draft', () => {
  let renderer: ReactTestRenderer;
  const render = (imageKey: string | null) =>
    act(() => {
      renderer.update(
        <ComposerSessionProvider initialDraft="Keep the composition">
          <Probe imageKey={imageKey} />
        </ComposerSessionProvider>,
      );
    });
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(
        <ComposerSessionProvider initialDraft="Keep the composition">
          <Probe imageKey="image-a" />
        </ComposerSessionProvider>,
      );
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('routes typing to the selected note and back to the whole-image request', () => {
    act(() => editing.addAnnotation(0.3, 0.4));
    expect(editing.selectedId).toBe(1);
    expect(composer.draft).toBe('');
    act(() => actions.setDraft('Make the cup blue'));
    act(() => editing.selectAnnotation(null));
    expect(composer.draft).toBe('Keep the composition');
    expect(editing.annotations).toEqual([{ id: 1, text: 'Make the cup blue', x: 0.3, y: 0.4 }]);
    act(() => editing.selectAnnotation(1));
    expect(composer.draft).toBe('Make the cup blue');
  });

  it('expands notes into positional model instructions while keeping the human brief', () => {
    act(() => editing.addAnnotation(0.3, 0.4));
    expect(editing.preparePrompt('Make the cup blue')).toEqual({
      displayPrompt: 'Keep the composition\npainting.editor.annotationSummary',
      prompt:
        'Keep the composition\npainting.editor.annotationGuide\npainting.editor.annotationInstruction',
    });
  });

  it('keeps unsent notes per image when the focus moves away and back', () => {
    act(() => editing.addAnnotation(0.2, 0.2));
    act(() => actions.setDraft('Add a hat'));
    render('image-b');
    expect(editing.selectedId).toBeNull();
    expect(editing.annotations).toEqual([]);
    expect(composer.draft).toBe('Keep the composition');
    render('image-a');
    expect(editing.annotations).toEqual([{ id: 1, text: 'Add a hat', x: 0.2, y: 0.2 }]);
  });

  it('removes a note and returns the field to the whole-image request when it was selected', () => {
    act(() => editing.addAnnotation(0.2, 0.2));
    act(() => editing.addAnnotation(0.8, 0.8));
    act(() => editing.removeAnnotation(2));
    expect(editing.annotations.map((note) => note.id)).toEqual([1]);
    expect(editing.selectedId).toBeNull();
    expect(composer.draft).toBe('Keep the composition');
  });

  it('locks notes while sending and restores the selected note after a rejected send', async () => {
    act(() => editing.addAnnotation(0.3, 0.4));
    act(() => actions.setDraft('Make the cup blue'));
    const pending = deferred<unknown>();
    mockGenerate.mockReturnValueOnce(pending.promise);
    let sending!: Promise<void>;
    act(() => {
      sending = mockSend();
    });
    expect(editing.isSubmitting).toBe(true);
    act(() => {
      editing.selectAnnotation(null);
      editing.addAnnotation(0.5, 0.5);
      editing.removeAnnotation(1);
    });
    expect(editing.selectedId).toBe(1);
    expect(editing.annotations).toHaveLength(1);

    await act(async () => {
      pending.reject(new Error('request rejected'));
      await sending.catch(() => undefined);
    });
    expect(editing.isSubmitting).toBe(false);
    expect(composer.draft).toBe('Make the cup blue');
    expect(editing.selectedId).toBe(1);
  });

  it('consumes the image notes once the request is accepted', async () => {
    act(() => editing.addAnnotation(0.3, 0.4));
    act(() => actions.setDraft('Make the cup blue'));
    mockGenerate.mockResolvedValueOnce({ paintingId: 'next' });
    await act(async () => {
      await mockSend();
    });
    expect(editing.annotations).toEqual([]);
    expect(editing.selectedId).toBeNull();
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
