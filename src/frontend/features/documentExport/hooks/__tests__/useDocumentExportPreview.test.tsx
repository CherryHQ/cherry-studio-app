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
    previewMarkdown: () => `<p>${markdown}</p>`,
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

test('Markdown preview and sharing use the same prepared image-bearing artifact', async () => {
  const ref = createRef<Preview>();
  const checked = createSession('Thinking and answer');
  const unchecked = createSession('Answer');
  const checkedArtifact = {
    ...markdownArtifact,
    text: 'Thinking and answer\n![Image](data:image/png;base64,AA==)',
  };
  const uncheckedArtifact = {
    ...markdownArtifact,
    text: 'Answer\n![Image](data:image/png;base64,AA==)',
  };
  checked.render.mockResolvedValue(checkedArtifact);
  unchecked.render.mockResolvedValue(uncheckedArtifact);
  await act(async () => {
    renderer = create(<Probe ref={ref} session={checked} format="markdown" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'ready', artifact: checkedArtifact });
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={unchecked} format="markdown" revision={1} />);
  });
  expect(ref.current?.state).toEqual({ status: 'ready', artifact: uncheckedArtifact });
  await expect(ref.current?.getArtifact(new AbortController().signal)).resolves.toBe(
    uncheckedArtifact,
  );
  expect(unchecked.render).toHaveBeenCalledTimes(1);
  expect(unchecked.save).not.toHaveBeenCalled();
  expect(checked.render).toHaveBeenCalledTimes(1);
});

test('image fallback retains the same brand signature in Markdown preview and delivery', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const signature = {
    brandName: 'Cherry Studio',
    timestamp: '2026/09/15 12:00',
    background: '#ffffff',
    foreground: '#111111',
    logoDataUrl: 'data:image/png;base64,AA==',
  };
  const watermark = { kind: 'cherry' as const, signature };
  session.render.mockImplementation(async (target) => {
    if (target.format === 'markdown') return markdownArtifact;
    throw new DocumentExportError('capture-failed');
  });
  await act(async () => {
    renderer = create(
      <Probe
        ref={ref}
        session={session}
        format="image"
        revision={0}
        currentPresentation={{ ...presentation, watermark }}
      />,
    );
  });
  expect(ref.current?.state).toEqual({
    status: 'markdown',
    text: 'Content\n---\n\n**Cherry Studio** · 2026/09/15 12:00\n',
    fallback: true,
  });
  await ref.current!.getArtifact(new AbortController().signal);
  expect(session.render).toHaveBeenLastCalledWith(
    { format: 'markdown', watermark },
    { signal: expect.any(AbortSignal) },
  );
});

test('preparing Markdown waits for the cancelled conversion and disables sharing until ready', async () => {
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
  await expect(ref.current!.getArtifact(new AbortController().signal)).rejects.toMatchObject({
    code: 'busy',
  });
  expect(session.render).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(htmlArtifact));
  await expect(ref.current!.getArtifact(new AbortController().signal)).resolves.toBe(
    markdownArtifact,
  );
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
  session.render.mockRejectedValueOnce(new DocumentExportError('capture-failed'));
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

test('an HTML failure keeps Markdown shareable without starting image capture', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  session.render.mockRejectedValueOnce(new DocumentExportError('storage-failed'));
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="html" revision={0} />);
  });
  expect(ref.current?.state).toEqual({ status: 'markdown', text: 'Content', fallback: true });
  await expect(ref.current?.getArtifact(new AbortController().signal)).resolves.toBe(
    markdownArtifact,
  );
  expect(session.render.mock.calls.map(([target]) => target.format)).toEqual(['html', 'markdown']);
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
  const signal = session.render.mock.calls[0][1]!.signal!;
  await act(async () => {
    renderer?.update(<Probe ref={ref} session={session} format="markdown" revision={1} />);
  });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    reject(new DocumentExportError('capture-failed'));
  });
  expect(ref.current?.state).toEqual({ status: 'ready', artifact: markdownArtifact });
  expect(session.render.mock.calls.map(([target]) => target.format)).toEqual(['image', 'markdown']);
});
