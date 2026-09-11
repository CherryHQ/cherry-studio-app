import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  DocumentExportArtifact,
  DocumentExportSession,
  DocumentExportTarget,
  ExportFormat,
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
  fontSize: 16,
  colors: { background: 'white', foreground: 'black', muted: 'gray', border: 'gray', link: 'blue' },
};
const capture = jest.fn();
type Preview = ReturnType<typeof useDocumentExportPreview>;
function Probe({
  ref,
  session,
  format,
  revision,
}: {
  ref: Ref<Preview>;
  session: DocumentExportSession;
  format: ExportFormat;
  revision: number;
}) {
  const preview = useDocumentExportPreview(session, format, presentation, capture, revision);
  useImperativeHandle(ref, () => preview, [preview]);
  return null;
}
function createSession(markdown = 'Content') {
  return {
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
