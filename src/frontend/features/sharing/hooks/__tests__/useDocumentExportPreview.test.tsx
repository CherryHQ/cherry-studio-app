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
  currentPresentation = presentation,
}: {
  ref: Ref<Preview>;
  session: DocumentExportSession;
  format: ExportFormat;
  currentPresentation?: ExportPresentation;
}) {
  const preview = useDocumentExportPreview(session, format, currentPresentation, capture);
  useImperativeHandle(ref, () => preview, [preview]);
  return null;
}
function createSession(markdown = 'Content') {
  return {
    document: {
      sections: [{ id: 'document', blocks: [{ kind: 'markdown' as const, source: markdown }] }],
    },
    markdown,
    previewDocument: () => '<p>Content</p>',
    previewMarkdown: (text: string) => `<p>${text}</p>`,
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

test('image preview prepares readable HTML without capturing or saving, then generates PNG on demand', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  expect(ref.current!.html).toBe(htmlArtifact.html);
  expect(session.render).toHaveBeenCalledWith(
    { format: 'html', presentation },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(capture).not.toHaveBeenCalled();
  expect(session.save).not.toHaveBeenCalled();
  const image: DocumentExportArtifact = {
    id: 'image',
    format: 'image',
    layout: 'pages',
    issues: [],
    pages: [
      {
        file: { uri: 'file:///page.png', filename: 'page.png', mediaType: 'image/png' },
        width: 1080,
        height: 1488,
      },
    ],
  };
  session.render.mockResolvedValueOnce(image);
  await expect(ref.current!.getArtifact(new AbortController().signal)).resolves.toBe(image);
  expect(session.render).toHaveBeenLastCalledWith(
    { format: 'image', presentation, capture, layout: 'pages' },
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
  expect(session.save).not.toHaveBeenCalled();
});

test('Markdown preview renders the exact prepared text with embedded images', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const prepared = { ...markdownArtifact, text: 'Content\n![Photo](data:image/png;base64,AA==)' };
  session.render.mockResolvedValue(prepared);
  session.previewMarkdown = (text) => `<main>${text}</main>`;
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="markdown" />);
  });
  expect(ref.current!.html).toContain('data:image/png;base64,AA==');
  await expect(ref.current!.getArtifact(new AbortController().signal)).resolves.toBe(prepared);
});

test('message card delivery produces one image and uses the same presentation as its prepared preview', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const card = {
    ...presentation,
    imageFrame: { background: '#ffffff', label: 'Message', excerptLabel: 'Excerpt' },
  };
  await act(async () => {
    renderer = create(
      <Probe ref={ref} session={session} format="image" currentPresentation={card} />,
    );
  });
  await ref.current!.getArtifact(new AbortController().signal);
  expect(session.render.mock.calls.map(([target]) => target)).toEqual([
    { format: 'html', presentation: card },
    { format: 'image', presentation: card, capture, layout: 'single' },
  ]);
});

test('preparation failure is explicit and never changes the selected export format', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const error = new DocumentExportError('capture-failed');
  session.render.mockRejectedValue(error);
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  expect(ref.current!.error).toBe(error);
  expect(session.render).toHaveBeenCalledTimes(1);
  expect(session.render.mock.calls[0][0].format).toBe('html');
  expect(capture).not.toHaveBeenCalled();
});

test('a superseded preview settles before the next format starts and cannot publish late content', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  let finish!: (artifact: DocumentExportArtifact) => void;
  session.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="html" />);
  });
  const signal = session.render.mock.calls[0][1]!.signal!;
  await act(async () => {
    renderer!.update(<Probe ref={ref} session={session} format="markdown" />);
  });
  expect(signal.aborted).toBe(true);
  expect(session.render).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ ...htmlArtifact, html: '<main>Stale</main>' });
  });
  expect(session.render).toHaveBeenCalledTimes(2);
  expect(ref.current!.html).not.toContain('Stale');
});

test('theme changes prepare new HTML while the old result is no longer current', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  let finish!: (artifact: DocumentExportArtifact) => void;
  session.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const dark = { ...presentation, colors: { ...presentation.colors, background: 'black' } };
  await act(async () => {
    renderer!.update(
      <Probe ref={ref} session={session} format="image" currentPresentation={dark} />,
    );
  });
  expect(ref.current!.isPreparing).toBe(true);
  await act(async () => {
    finish({ ...htmlArtifact, html: '<main>Dark</main>' });
  });
  expect(ref.current!.html).toBe('<main>Dark</main>');
});

test('cancelled delivery never starts image conversion', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  const controller = new AbortController();
  controller.abort();
  await expect(ref.current!.getArtifact(controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(session.render).toHaveBeenCalledTimes(1);
});
