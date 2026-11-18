import { runInNewContext } from 'node:vm';

import { imageMeasurementScript, imagePageReadinessScript } from '../imageCaptureScripts';

test.each([true, false])('capture waits for the resized browser viewport: %s', async (resizes) => {
  let frames = 0;
  let receive!: (message: { phase?: string; error?: boolean }) => void;
  const result = new Promise<{ phase?: string; error?: boolean }>((resolve) => {
    receive = resolve;
  });
  const root = { style: {} };
  const clip = { style: {} };
  const main = { style: {} };
  const window = {
    innerWidth: 360,
    innerHeight: 636,
    visualViewport: { width: 2, height: 636 },
    scrollTo() {},
    ReactNativeWebView: { postMessage: (data: string) => receive(JSON.parse(data)) },
  };
  runInNewContext(
    imagePageReadinessScript(
      1,
      2,
      360,
      { top: 556, height: 80 },
      { width: 1077, height: 240, scale: 3, layoutHeight: 80 },
      2.625,
      'single',
    ),
    {
      window,
      document: {
        documentElement: { style: {} },
        body: { style: {} },
        querySelector: (selector: string) => (selector === 'main' ? main : { content: '' }),
        getElementById: (id: string) => (id === 'export-page' ? root : clip),
      },
      getComputedStyle: () => ({ backgroundColor: '#ffffff' }),
      requestAnimationFrame: (callback: () => void) => {
        frames++;
        if (resizes && frames >= 5) {
          window.visualViewport.width = 1077 / 2.625;
          window.visualViewport.height = 240 / 2.625;
        }
        callback();
      },
    },
  );
  expect(await result).toMatchObject(resizes ? { phase: 'ready' } : { error: true });
  expect(frames).toBe(resizes ? 7 : 120);
});

/** Small measured-layout fixture; the WebView remains responsible for real font and line geometry. */
function measuredCard(kind: 'short' | 'paragraph' | 'code' | 'table') {
  const attributes = new Map([
    ['data-share-card-max-height', '3600'],
    ['data-share-card-omission', 'Omitted'],
  ]);
  const style: Record<string, string> = {};
  const code = {
    textContent: Array.from({ length: 300 }, (_, index) => `line ${index}`).join('\n'),
  };
  const cells = Array.from({ length: 20 }, (_, index) => ({
    textContent: `row ${index}`,
    appendChild(node: { textContent: string }) {
      this.textContent += node.textContent;
    },
  }));
  const rows = cells.map((cell) => ({
    lastElementChild: cell,
    remove() {
      table.rows.splice(table.rows.indexOf(this), 1);
    },
  }));
  const table = { rows, tHead: { rows: [rows[0]] } };
  const main = {
    scrollWidth: 360,
    querySelector: () => card,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, height: card.getBoundingClientRect().height + 104 }),
  };
  const card = {
    children: [] as unknown[],
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getBoundingClientRect: () => ({
      top: 0,
      bottom: article.getBoundingClientRect().bottom,
      height: article.getBoundingClientRect().height,
    }),
    querySelectorAll: () => [],
    querySelector: () => article,
  };
  const height = () =>
    kind === 'code'
      ? 40 + code.textContent.split('\n').length * 20
      : kind === 'table'
        ? table.rows.length * 32
        : Math.min(kind === 'short' ? 48 : 6000, Number(style.webkitLineClamp ?? Infinity) * 24);
  const isStructured = kind === 'code' || kind === 'table';
  const prefixHeight = kind === 'code' ? 900 : kind === 'table' ? 3300 : 0;
  const prefix = {
    tagName: 'P',
    children: [],
    parentElement: undefined as unknown,
    matches: (selector: string) => selector.split(',').includes('p'),
    classList: { contains: () => false },
    querySelector: () => null,
    getBoundingClientRect: () => ({ top: 24, bottom: 24 + prefixHeight }),
  };
  const block = {
    tagName: isStructured ? 'DIV' : 'P',
    children: [],
    parentElement: undefined as unknown,
    style,
    textContent: 'Original paragraph source.',
    classList: { contains: () => false },
    matches(selector: string) {
      const selectors = selector.split(',');
      return kind === 'code'
        ? selectors.includes('.code-block')
        : kind === 'table'
          ? selectors.includes('.table-scroll')
          : selectors.includes('p');
    },
    querySelector(selector: string) {
      return kind === 'code' && selector === 'pre code'
        ? code
        : kind === 'table' && selector === 'table'
          ? table
          : null;
    },
    getBoundingClientRect: () => ({
      top: 24 + (isStructured ? prefixHeight + 12 : 0),
      bottom: 24 + (isStructured ? prefixHeight + 12 : 0) + height(),
    }),
    remove() {
      article.children.splice(article.children.indexOf(block), 1);
    },
  };
  const tail = {
    removed: false,
    tagName: 'P',
    children: [],
    parentElement: undefined as unknown,
    classList: { contains: () => false },
    matches: (selector: string) => selector.split(',').includes('p'),
    querySelector: () => null,
    getBoundingClientRect: () => ({
      top: block.getBoundingClientRect().bottom + 12,
      bottom: block.getBoundingClientRect().bottom + 112,
    }),
    remove() {
      this.removed = true;
      article.children.splice(article.children.indexOf(tail), 1);
    },
  };
  const article = {
    tagName: 'ARTICLE',
    parentElement: card,
    children: (isStructured ? [prefix, block, tail] : [block, tail]) as unknown[],
    classList: { contains: () => false },
    matches: () => false,
    contains: (node: unknown) => article.children.includes(node),
    getBoundingClientRect: () => ({
      top: 0,
      bottom: block.getBoundingClientRect().bottom + (tail.removed ? 0 : 112),
      height: block.getBoundingClientRect().bottom + (tail.removed ? 0 : 112),
    }),
  };
  prefix.parentElement = article;
  block.parentElement = article;
  tail.parentElement = article;
  card.children = [article];
  let receive!: (value: { phase?: string; error?: boolean; height?: number }) => void;
  const measurement = new Promise<{ phase?: string; error?: boolean; height?: number }>(
    (resolve) => {
      receive = resolve;
    },
  );
  runInNewContext(imageMeasurementScript(1, 'single'), {
    window: { ReactNativeWebView: { postMessage: (data: string) => receive(JSON.parse(data)) } },
    document: {
      querySelector: () => main,
      querySelectorAll: () => [],
      images: [],
      fonts: { ready: Promise.resolve() },
      createTextNode: (textContent: string) => ({ textContent }),
    },
    getComputedStyle: () => ({ paddingBottom: '0', borderBottomWidth: '0', lineHeight: '24' }),
    requestAnimationFrame: (callback: () => void) => callback(),
  });
  return { measurement, attributes, style, code, table, cells, block, tail };
}

test('short cards keep every block without introducing an omission label', async () => {
  const fixture = measuredCard('short');
  expect(await fixture.measurement).toMatchObject({ phase: 'measure', height: 288 });
  expect(fixture.tail.removed).toBe(false);
  expect(fixture.attributes.has('aria-label')).toBe(false);
});

test('a boundary paragraph is clamped to whole lines with space reserved for the complete footer', async () => {
  const fixture = measuredCard('paragraph');
  const result = await fixture.measurement;
  expect(result).toMatchObject({ phase: 'measure', height: 3584 });
  expect(fixture.style.webkitLineClamp).toBe('144');
  expect(fixture.block.textContent).toBe('Original paragraph source.');
  expect(fixture.tail.removed).toBe(true);
  expect(fixture.attributes.get('aria-label')).toBe('Omitted');
});

test('code truncation retains complete source lines and puts the ellipsis on its last retained line', async () => {
  const fixture = measuredCard('code');
  expect(await fixture.measurement).toMatchObject({ phase: 'measure', height: 3600 });
  const lines = fixture.code.textContent.split('\n');
  expect(lines).toHaveLength(126);
  expect(lines[125]).toBe('line 125 …');
  expect(fixture.tail.removed).toBe(true);
});

test('table truncation keeps the header and complete rows with one final-cell ellipsis', async () => {
  const fixture = measuredCard('table');
  expect(await fixture.measurement).toMatchObject({ phase: 'measure', height: 3600 });
  expect(fixture.table.rows).toHaveLength(5);
  expect(fixture.cells[4].textContent).toBe('row 4 …');
  expect(fixture.tail.removed).toBe(true);
});
