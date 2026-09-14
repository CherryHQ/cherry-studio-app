import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  DocumentExportError,
  type DocumentExportArtifact,
  type DocumentExportSession,
  type DocumentExportTarget,
  type ExportFormat,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';

import { useDocumentExportPreview } from '../useDocumentExportPreview';

const htmlArtifact: DocumentExportArtifact = {
  id: 'html',
  format: 'html',
  file: { uri: 'file:///preview.html', filename: 'preview.html', mediaType: 'text/html' },
  html: '<p>Content</p>',
  issues: [],
};
const markdownArtifact: DocumentExportArtifact = {
  id: 'markdown',
  format: 'markdown',
  file: { uri: 'file:///preview.md', filename: 'preview.md', mediaType: 'text/markdown' },
  text: 'Content',
  issues: [],
};
const presentation = {
  width: 360,
  typography: {
    base: { fontSize: 16, lineHeight: 24 },
    sm: { fontSize: 14, lineHeight: 20 },
    lg: { fontSize: 18, lineHeight: 28 },
    xl: { fontSize: 20, lineHeight: 26 },
  },
  colors: {
    background: 'white',
    foreground: 'black',
    muted: 'gray',
    tertiary: 'gray',
    border: 'gray',
    subtleBorder: 'gray',
    link: 'blue',
    bubble: 'gray',
    secondary: 'gray',
    codeBlock: 'gray',
    inlineCode: 'gray',
    inlineCodeForeground: 'black',
  },
};
const capture = jest.fn();
type Preview = ReturnType<typeof useDocumentExportPreview>;
function Probe({
  ref,
  session,
  format,
  revision,
  currentPresentation = presentation,
}: {
  ref: Ref<Preview>;
  session: DocumentExportSession;
  format: ExportFormat;
  revision: number;
  currentPresentation?: ExportPresentation;
}) {
  const preview = useDocumentExportPreview(session, format, currentPresentation, capture, revision);
  useImperativeHandle(ref, () => preview, [preview]);
  return null;
}
function createSession(markdown = 'Content') {
  return {
    document: {
      sections: [{ id: 'document', blocks: [{ kind: 'markdown' as const, source: markdown }] }],
    },
    markdown,
    render: jest.fn(
      async (
        target: DocumentExportTarget,
        _context?: Parameters<DocumentExportSession['render']>[1],
      ): Promise<DocumentExportArtifact> =>
        target.format === 'markdown' ? markdownArtifact : htmlArtifact,
    ),
    save: jest.fn(),
    dispose: jest.fn(),
  } satisfies DocumentExportSession;
}
let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('default Markdown and its unchecked snapshot stay in memory until sharing', async () => {
  const ref = createRef<Preview>();
  const checked = createSession('Thinking and answer');
  const unchecked = createSession('Answer');
  await act(async () => {
    renderer = create(<Probe ref={ref} session={checked} format="markdown" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'markdown', text: 'Thinking and answer' });
  expect(checked.render).not.toHaveBeenCalled();
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={unchecked} format="markdown" revision={1} />);
  });
  expect(ref.current?.state).toEqual({ status: 'markdown', text: 'Answer' });
  expect(unchecked.render).not.toHaveBeenCalled();
  await expect(ref.current?.getArtifact(new AbortController().signal)).resolves.toBe(
    markdownArtifact,
  );
  expect(unchecked.render).toHaveBeenCalledWith(
    { format: 'markdown' },
    { signal: expect.any(AbortSignal) },
  );
  expect(checked.render).not.toHaveBeenCalled();
});

test('sharing Markdown waits for the cancelled conversion and never starts an image render', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const pending = deferred<DocumentExportArtifact>();
  session.render.mockReturnValueOnce(pending.promise);
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="html" revision={0} />);
  });
  const signal = session.render.mock.calls[0][1]!.signal!;
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={session} format="markdown" revision={1} />);
  });
  expect(signal.aborted).toBe(true);
  const sharing = ref.current!.getArtifact(new AbortController().signal);
  await Promise.resolve();
  expect(session.render).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(htmlArtifact));
  await expect(sharing).resolves.toBe(markdownArtifact);
  expect(session.render.mock.calls.map(([target]) => target.format)).toEqual(['html', 'markdown']);
});

test('returning to a format invalidates its old artifact before a new render finishes', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="html" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'ready', artifact: htmlArtifact });
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={session} format="markdown" revision={1} />);
  });
  const pending = deferred<DocumentExportArtifact>();
  session.render.mockReturnValueOnce(pending.promise);
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={session} format="html" revision={2} />);
  });
  expect(ref.current?.state.status).toBe('loading');
  await expect(ref.current?.getArtifact(new AbortController().signal)).rejects.toMatchObject({
    code: 'busy',
  });
  await act(async () => pending.resolve({ ...htmlArtifact, id: 'new-html' }));
  expect(ref.current?.state).toMatchObject({ status: 'ready', artifact: { id: 'new-html' } });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('a theme change invalidates the old artifact while the new presentation is rendering', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="html" revision={0} />);
  });
  expect(ref.current!.state.status).toBe('ready');
  const pending = deferred<DocumentExportArtifact>();
  session.render.mockReturnValueOnce(pending.promise);
  const dark = {
    ...presentation,
    colors: { ...presentation.colors, background: 'black', foreground: 'white' },
  };
  await act(async () => {
    renderer?.update(
      <Probe ref={ref} session={session} format="html" revision={0} currentPresentation={dark} />,
    );
  });
  expect(ref.current!.state.status).toBe('loading');
  await expect(ref.current!.getArtifact(new AbortController().signal)).rejects.toMatchObject({
    code: 'busy',
  });
  expect(session.render.mock.calls.at(-1)?.[0]).toEqual({ format: 'html', presentation: dark });
  await act(async () => pending.resolve({ ...htmlArtifact, id: 'dark' }));
  expect(ref.current!.state).toMatchObject({ status: 'ready', artifact: { id: 'dark' } });
});

test('an image failure automatically produces a shareable document instead of an error state', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  session.render.mockRejectedValueOnce(new DocumentExportError('image-size-limit'));
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'ready', artifact: htmlArtifact, fallback: true });
  expect(session.render.mock.calls.map(([target]) => target.format)).toEqual(['image', 'html']);
  await expect(ref.current?.getArtifact(new AbortController().signal)).resolves.toBe(htmlArtifact);
});

test('if HTML also fails, complete Markdown stays available without writing a file until sharing', async () => {
  const ref = createRef<Preview>();
  const session = createSession('The entire selection');
  session.render
    .mockRejectedValueOnce(new DocumentExportError('capture-failed'))
    .mockRejectedValueOnce(new DocumentExportError('storage-failed'));
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" revision={0} />);
  });
  expect(ref.current?.state).toEqual({
    status: 'markdown',
    text: 'The entire selection',
    fallback: true,
  });
  expect(session.render).toHaveBeenCalledTimes(2);
  await ref.current?.getArtifact(new AbortController().signal);
  expect(session.render.mock.calls.map(([target]) => target.format)).toEqual([
    'image',
    'html',
    'markdown',
  ]);
});

test('image resource limits go directly to text instead of repeating the same rejected HTML render', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  session.render.mockRejectedValueOnce(new DocumentExportError('image-resource-limit'));
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'markdown', text: 'Content', fallback: true });
  expect(session.render).toHaveBeenCalledTimes(1);
});

test('cancelling an old image request does not start a fallback for the superseded selection', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  let reject!: (error: Error) => void;
  session.render.mockReturnValueOnce(
    new Promise((_, fail) => {
      reject = fail;
    }),
  );
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" revision={0} />);
  });
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={session} format="markdown" revision={1} />);
    reject(new DocumentExportError('capture-failed'));
  });
  expect(ref.current?.state).toEqual({ status: 'markdown', text: 'Content' });
  expect(session.render).toHaveBeenCalledTimes(1);
});
