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
import type { ExportWatermark } from '@/shared/contracts/fileExport';

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

test('Markdown preview exposes exact prepared source and filename without reparsing it as HTML', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const prepared = { ...markdownArtifact, text: 'Content\n![Photo](data:image/png;base64,AA==)' };
  session.render.mockResolvedValue(prepared);
  session.previewMarkdown = jest.fn(() => {
    throw new Error('Raw Markdown must not be reparsed');
  });
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="markdown" />);
  });
  expect(ref.current!.text).toBe(prepared.text);
  expect(ref.current!.filename).toBe('preview.md');
  expect(ref.current!.html).toBe('');
  await expect(ref.current!.getArtifact(new AbortController().signal)).resolves.toBe(prepared);
});

test('message card delivery produces one image and uses the same presentation as its prepared preview', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  const card: ExportPresentation = {
    ...presentation,
    imageFrame: { background: '#ffffff', label: 'Message', layout: 'single' },
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

test.each(['image', 'html', 'markdown'] as const)(
  'local %s saving can render without the active sharing watermark',
  async (format) => {
    const ref = createRef<Preview>();
    const session = createSession();
    const watermark: ExportWatermark = {
      kind: 'cherry',
      signature: {
        background: '#ffffff',
        foreground: '#000000',
        brandColor: '#ff0000',
        logoDataUrl: 'data:image/png;base64,AA==',
        brandName: 'Cherry Studio',
        downloadLabel: 'Scan',
        downloadLinkLabel: 'Download',
        downloadUrl: 'https://example.com',
        qrCodeDataUrl: 'data:image/png;base64,AA==',
      },
    };
    const signed = { ...presentation, watermark };
    await act(async () => {
      renderer = create(
        <Probe ref={ref} session={session} format={format} currentPresentation={signed} />,
      );
    });
    await ref.current!.getArtifact(new AbortController().signal, { watermark: { kind: 'none' } });
    const saved = session.render.mock.calls.at(-1)![0];
    expect(saved.format).toBe(format);
    expect(saved.format === 'markdown' ? saved.watermark : saved.presentation.watermark).toEqual({
      kind: 'none',
    });
    await ref.current!.getArtifact(new AbortController().signal);
    const shared = session.render.mock.calls.at(-1)![0];
    expect(shared.format === 'markdown' ? shared.watermark : shared.presentation.watermark).toBe(
      watermark,
    );
    expect(signed.watermark).toBe(watermark);
  },
);

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

test('the browser receives only prepared HTML, not a temporary document during asset loading', async () => {
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
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  expect(ref.current!.isPreparing).toBe(true);
  expect(ref.current!.html).toBe('');
  await act(async () => {
    finish({ ...htmlArtifact, html: '<main>Prepared assets</main>' });
  });
  expect(ref.current!.isPreparing).toBe(false);
  expect(ref.current!.html).toBe('<main>Prepared assets</main>');
});

test('image → HTML → image isolates failures and page measurements even when HTML is identical', async () => {
  const ref = createRef<Preview>();
  const session = createSession();
  await act(async () => {
    renderer = create(<Probe ref={ref} session={session} format="image" />);
  });
  const first = ref.current!;
  act(() => first.onPreviewError());
  expect(ref.current!.error).toBeInstanceOf(DocumentExportError);
  await act(async () => {
    renderer!.update(<Probe ref={ref} session={session} format="html" />);
  });
  const html = ref.current!;
  expect(html.error).toBeUndefined();
  await act(async () => {
    renderer!.update(<Probe ref={ref} session={session} format="image" />);
  });
  expect(ref.current!.html).toBe(first.html);
  expect(ref.current!.error).toBeUndefined();
  const pages = [{ top: 0, height: 300 }];
  act(() => ref.current!.onPages(pages));
  act(() => {
    first.onPreviewError(new Error('Late image error'));
    html.onPreviewError(new Error('Late HTML error'));
    first.onPages([{ top: 0, height: 999 }]);
  });
  expect(ref.current!.error).toBeUndefined();
  expect(ref.current!.pages).toEqual(pages);
});

test('returning to image while HTML preparation is pending does not revive the earlier image result', async () => {
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
  await act(async () => {
    renderer!.update(<Probe ref={ref} session={session} format="html" />);
  });
  await act(async () => {
    renderer!.update(<Probe ref={ref} session={session} format="image" />);
  });
  expect(ref.current!.isPreparing).toBe(true);
  expect(ref.current!.html).toBe('');
  expect(session.render).toHaveBeenCalledTimes(2);
  await act(async () => finish({ ...htmlArtifact, html: '<main>Obsolete HTML</main>' }));
  expect(session.render).toHaveBeenCalledTimes(3);
  expect(ref.current!.isPreparing).toBe(false);
  expect(ref.current!.html).toBe(htmlArtifact.html);
});

test.each([true, false])(
  'late measurements cannot clear a failed preview (batched: %s)',
  async (batched) => {
    const ref = createRef<Preview>();
    const session = createSession();
    await act(async () => {
      renderer = create(<Probe ref={ref} session={session} format="image" />);
    });
    const failedPreview = ref.current!;
    const error = new DocumentExportError('capture-failed');
    const pages = [{ top: 0, height: 300 }];
    if (batched) {
      act(() => {
        failedPreview.onPreviewError(error);
        failedPreview.onPages(pages);
      });
    } else {
      act(() => failedPreview.onPreviewError(error));
      act(() => failedPreview.onPages(pages));
    }
    expect(ref.current!.error).toBe(error);

    await act(async () => ref.current!.retry());
    act(() => ref.current!.onPages(pages));
    act(() => failedPreview.onPreviewError(error));
    expect(ref.current!.error).toBeUndefined();
    expect(ref.current!.pages).toEqual(pages);
  },
);

test.each(['preparation', 'browser'] as const)(
  'retry clears a %s failure before the replacement finishes',
  async (failure) => {
    const ref = createRef<Preview>();
    const session = createSession();
    const error = new DocumentExportError('capture-failed');
    if (failure === 'preparation') session.render.mockRejectedValueOnce(error);
    await act(async () => {
      renderer = create(<Probe ref={ref} session={session} format="image" />);
    });
    const previous = ref.current!;
    if (failure === 'browser') act(() => previous.onPreviewError(error));
    expect(ref.current!.error).toBe(error);
    let finish!: (artifact: DocumentExportArtifact) => void;
    session.render.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => ref.current!.retry());
    expect(ref.current!.isPreparing).toBe(true);
    expect(ref.current!.error).toBeUndefined();
    act(() => previous.onPreviewError(error));
    expect(ref.current!.error).toBeUndefined();
    await act(async () => finish(htmlArtifact));
    expect(ref.current!.isPreparing).toBe(false);
    expect(ref.current!.html).toBe(htmlArtifact.html);
    expect(ref.current!.error).toBeUndefined();
    // A genuine failure from the new browser must still be reported.
    const sizeError = new DocumentExportError('image-size-limit');
    act(() => ref.current!.onPreviewError(sizeError));
    expect(ref.current!.error).toBe(sizeError);
  },
);
