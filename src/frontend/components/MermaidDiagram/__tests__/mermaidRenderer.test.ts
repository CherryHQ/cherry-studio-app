import type { MermaidPageRequest } from '@cherrystudio/mermaid-webview/protocol';

import { MermaidRenderer, type MermaidRendererPage } from '../utils/mermaidRenderer';

function attachLoadingPage(renderer: MermaidRenderer) {
  const sent: MermaidPageRequest[] = [];
  const page: MermaidRendererPage & { resets: number } = {
    resets: 0,
    send: (request) => sent.push(request),
    reset: () => {
      page.resets += 1;
    },
  };
  renderer.attach(page);
  return { page, sent };
}

function attachPage(renderer: MermaidRenderer) {
  const attached = attachLoadingPage(renderer);
  renderer.receive(attached.page, { type: 'ready' });
  return attached;
}

function rendered(id: number, svg = `<svg>${id}</svg>`) {
  return { type: 'rendered' as const, id, svg, width: 100, height: 50 };
}

describe('MermaidRenderer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders one diagram at a time and caches each result by source and theme', async () => {
    const renderer = new MermaidRenderer();
    const first = renderer.render('graph TD; A-->B', false);
    const second = renderer.render('graph TD; C-->D', false);
    expect(renderer.isActive()).toBe(true);
    const { page, sent } = attachPage(renderer);

    expect(sent.map((request) => request.source)).toEqual(['graph TD; A-->B']);
    renderer.receive(page, rendered(sent[0].id));
    expect(sent.map((request) => request.source)).toEqual(['graph TD; A-->B', 'graph TD; C-->D']);
    renderer.receive(page, { type: 'failed', id: sent[1].id });

    await expect(first).resolves.toEqual({
      status: 'rendered',
      svg: `<svg>${sent[0].id}</svg>`,
      width: 100,
      height: 50,
    });
    await expect(second).resolves.toEqual({ status: 'failed' });
    expect(renderer.peek('graph TD; A-->B', false)).toEqual(await first);
    expect(renderer.peek('graph TD; A-->B', true)).toBeUndefined();
    expect(renderer.peek('graph TD; C-->D', false)).toEqual({ status: 'failed' });
  });

  test('shares one request between callers waiting for the same diagram', () => {
    const renderer = new MermaidRenderer();
    const { sent } = attachPage(renderer);

    expect(renderer.render('pie\n"A": 1', true)).toBe(renderer.render('pie\n"A": 1', true));
    expect(sent).toHaveLength(1);
  });

  test('ignores answers that do not belong to the current request', () => {
    const renderer = new MermaidRenderer();
    const { page, sent } = attachPage(renderer);
    void renderer.render('graph TD; A-->B', false);

    renderer.receive(page, rendered(sent[0].id + 1));
    expect(renderer.peek('graph TD; A-->B', false)).toBeUndefined();
  });

  test('fails a diagram whose page stops answering and replaces the page', async () => {
    const renderer = new MermaidRenderer();
    const { page } = attachPage(renderer);
    const hung = renderer.render('graph TD; A-->B', false);
    void renderer.render('graph TD; C-->D', false);

    jest.advanceTimersByTime(10_000);
    await expect(hung).resolves.toEqual({ status: 'failed' });
    expect(page.resets).toBe(1);

    // The replacement page continues with the next diagram; the failed source is not retried.
    renderer.detach(page);
    const next = attachPage(renderer);
    expect(next.sent.map((request) => request.source)).toEqual(['graph TD; C-->D']);
    void renderer.render('graph TD; A-->B', false);
    expect(next.sent).toHaveLength(1);
  });

  test('fails the diagram that crashed the page instead of retrying it', async () => {
    const renderer = new MermaidRenderer();
    const { page } = attachPage(renderer);
    const crashed = renderer.render('graph TD; A-->B', false);

    renderer.fail(page);

    await expect(crashed).resolves.toEqual({ status: 'failed' });
    expect(page.resets).toBe(1);
  });

  test('returns an unfinished diagram to the queue when its page unmounts', () => {
    const renderer = new MermaidRenderer();
    const { page } = attachPage(renderer);
    void renderer.render('graph TD; A-->B', false);

    renderer.detach(page);
    const next = attachPage(renderer);

    expect(next.sent.map((request) => request.source)).toEqual(['graph TD; A-->B']);
  });

  test('fails waiting diagrams and releases the page when it cannot load', async () => {
    const renderer = new MermaidRenderer();
    const waiting = renderer.render('graph TD; A-->B', false);

    renderer.unavailable();

    await expect(waiting).resolves.toEqual({ status: 'failed' });
    expect(renderer.isActive()).toBe(false);
  });

  test('fails waiting diagrams even when the HTML asset never finishes loading', async () => {
    const renderer = new MermaidRenderer();
    const waiting = renderer.render('graph TD; A-->B', false);

    jest.advanceTimersByTime(10_000);

    await expect(waiting).resolves.toEqual({ status: 'failed' });
    expect(renderer.isActive()).toBe(false);
    // Remounting the same diagram reads the failure instead of restarting the page.
    await expect(renderer.render('graph TD; A-->B', false)).resolves.toEqual({ status: 'failed' });
    expect(renderer.isActive()).toBe(false);
  });

  test('keeps the initialization deadline across more requests and page mounts', async () => {
    const renderer = new MermaidRenderer();
    const first = renderer.render('graph TD; A-->B', false);
    jest.advanceTimersByTime(5_000);
    const second = renderer.render('graph TD; C-->D', false);
    const old = attachLoadingPage(renderer);
    jest.advanceTimersByTime(4_999);
    renderer.detach(old.page);
    const next = attachLoadingPage(renderer);

    expect(renderer.peek('graph TD; A-->B', false)).toBeUndefined();
    jest.advanceTimersByTime(1);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'failed' },
      { status: 'failed' },
    ]);
    expect(renderer.isActive()).toBe(false);
    expect(next.sent).toHaveLength(0);
    expect(next.page.resets).toBe(0);
  });

  test('fails the whole batch on a page error before ready without resetting it', async () => {
    const renderer = new MermaidRenderer();
    const first = renderer.render('graph TD; A-->B', false);
    const second = renderer.render('graph TD; C-->D', false);
    const { page } = attachLoadingPage(renderer);

    renderer.fail(page);
    renderer.fail(page);
    jest.advanceTimersByTime(10_000);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'failed' },
      { status: 'failed' },
    ]);
    expect(renderer.isActive()).toBe(false);
    expect(page.resets).toBe(0);
  });

  test('clears the initialization deadline and gives rendering its own timeout', async () => {
    const renderer = new MermaidRenderer();
    const waiting = renderer.render('graph TD; A-->B', false);
    const { page, sent } = attachLoadingPage(renderer);
    jest.advanceTimersByTime(9_000);
    renderer.receive(page, { type: 'ready' });

    jest.advanceTimersByTime(9_999);
    expect(renderer.peek('graph TD; A-->B', false)).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(page.resets).toBe(0);
    jest.advanceTimersByTime(1);

    await expect(waiting).resolves.toEqual({ status: 'failed' });
    expect(page.resets).toBe(1);
  });

  test.each(['timeout', 'error'])(
    'stops when a replacement page fails to initialize: %s',
    async (failure) => {
      const renderer = new MermaidRenderer();
      const first = renderer.render('graph TD; A-->B', false);
      const second = renderer.render('graph TD; C-->D', false);
      const old = attachPage(renderer);
      renderer.fail(old.page);
      const next = attachLoadingPage(renderer);

      if (failure === 'error') renderer.fail(next.page);
      jest.advanceTimersByTime(10_000);

      await expect(Promise.all([first, second])).resolves.toEqual([
        { status: 'failed' },
        { status: 'failed' },
      ]);
      expect(renderer.isActive()).toBe(false);
      expect(old.page.resets).toBe(1);
      expect(next.page.resets).toBe(0);
      expect(next.sent).toHaveLength(0);
    },
  );

  test('can render a new source after initialization fails and ignores the retired page', async () => {
    const renderer = new MermaidRenderer();
    void renderer.render('graph TD; A-->B', false);
    const old = attachLoadingPage(renderer);
    renderer.fail(old.page);
    const waiting = renderer.render('graph TD; C-->D', false);
    const next = attachLoadingPage(renderer);

    renderer.receive(old.page, { type: 'ready' });
    renderer.fail(old.page);
    renderer.detach(old.page);
    expect(next.sent).toHaveLength(0);
    expect(renderer.isActive()).toBe(true);

    renderer.receive(next.page, { type: 'ready' });
    expect(next.sent.map((request) => request.source)).toEqual(['graph TD; C-->D']);
    renderer.receive(next.page, rendered(next.sent[0].id));

    await expect(waiting).resolves.toMatchObject({ status: 'rendered' });
    jest.advanceTimersByTime(10_000);
    expect(renderer.isActive()).toBe(true);
    expect(next.page.resets).toBe(0);
  });

  test('ignores a detached page result even when the same request is sent again', async () => {
    const renderer = new MermaidRenderer();
    const waiting = renderer.render('graph TD; A-->B', false);
    const old = attachPage(renderer);
    renderer.detach(old.page);
    const next = attachPage(renderer);
    expect(next.sent[0].id).toBe(old.sent[0].id);

    renderer.receive(old.page, rendered(old.sent[0].id, '<svg>old</svg>'));
    expect(renderer.peek('graph TD; A-->B', false)).toBeUndefined();
    renderer.receive(next.page, rendered(next.sent[0].id, '<svg>new</svg>'));

    await expect(waiting).resolves.toMatchObject({ status: 'rendered', svg: '<svg>new</svg>' });
  });

  test('keeps the page for a minute after the last diagram', () => {
    const renderer = new MermaidRenderer();
    const { page, sent } = attachPage(renderer);
    void renderer.render('graph TD; A-->B', false);
    renderer.receive(page, rendered(sent[0].id));

    jest.advanceTimersByTime(59_999);
    expect(renderer.isActive()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(renderer.isActive()).toBe(false);
  });

  test('does not send sources above the page limit', async () => {
    const renderer = new MermaidRenderer();
    const source = 'x'.repeat(32_769);

    await expect(renderer.render(source, false)).resolves.toEqual({ status: 'failed' });
    expect(renderer.peek(source, false)).toEqual({ status: 'failed' });
    expect(renderer.isActive()).toBe(false);
  });

  test('evicts the least recently used results beyond the SVG budget', () => {
    const renderer = new MermaidRenderer();
    const { page, sent } = attachPage(renderer);
    const large = 'x'.repeat(3 * 1024 * 1024);
    for (const source of ['a', 'b', 'c']) {
      void renderer.render(source, false);
      renderer.receive(page, rendered(sent.at(-1)!.id, large));
    }

    expect(renderer.peek('a', false)).toBeUndefined();
    expect(renderer.peek('b', false)?.status).toBe('rendered');
    expect(renderer.peek('c', false)?.status).toBe('rendered');
  });
});
