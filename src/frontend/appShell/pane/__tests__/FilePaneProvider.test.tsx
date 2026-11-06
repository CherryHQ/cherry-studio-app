import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePaneProvider, useFilePane } from '../FilePaneProvider';

let mockWindowClass = 'wide';
let mockSource = 'local';
let mockIsLayoutCurrent = true;
let mockFold: { x: number; y: number; width: number; height: number } | null = null;

jest.mock('@/frontend/appShell/layout', () => ({
  isAcross: jest.requireActual('@/frontend/appShell/layout/paneSplit').isAcross,
  useFoldRegion: () => mockFold,
  useIsFoldRegionLayoutCurrent: () => mockIsLayoutCurrent,
  useWindowClass: () => mockWindowClass,
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  useChatSource: () => ({ source: mockSource }),
}));

let pane: ReturnType<typeof useFilePane>;
function Probe() {
  const current = useFilePane();
  useEffect(() => {
    pane = current;
  });
  return null;
}

let renderer: ReactTestRenderer;
function render() {
  act(() => {
    renderer = create(
      <FilePaneProvider>
        <Probe />
      </FilePaneProvider>,
    );
  });
}

function update() {
  act(() =>
    renderer.update(
      <FilePaneProvider>
        <Probe />
      </FilePaneProvider>,
    ),
  );
}

function narrow() {
  mockWindowClass = 'compact';
  update();
}

function expand() {
  mockWindowClass = 'wide';
  update();
}

const file = { entryId: '00000000-0000-7000-8000-000000000001' as never };

beforeEach(() => {
  mockWindowClass = 'wide';
  mockSource = 'local';
  mockIsLayoutCurrent = true;
  mockFold = null;
});
afterEach(() => act(() => renderer.unmount()));

it('returns an expanded preview beside the chat whenever the preview or pane is left', () => {
  render();
  act(() => pane!.openFile(file));
  act(() => pane!.setExpanded(true));
  expect(pane).toMatchObject({ file, isExpanded: true, isOpen: true });

  act(() => pane!.closeFile());
  expect(pane).toMatchObject({ file: null, isExpanded: false, isOpen: true });

  act(() => pane!.openFile(file));
  act(() => pane!.setExpanded(true));
  act(() => pane!.close());
  // The open file stays for the next visit; only the chat's place is restored.
  expect(pane).toMatchObject({ file, isExpanded: false, isOpen: false });
});

it.each([
  ['compact', 'local', false],
  ['medium', 'local', true],
  ['expanded', 'remote', false],
])('offers a pane in a %s window with a %s source: %s', (windowClass, source, isAvailable) => {
  mockWindowClass = windowClass;
  mockSource = source;
  render();
  expect(pane!.isAvailable).toBe(isAvailable);
});

it('keeps the touched preview expanded over the chat while narrow and returns it beside the chat', () => {
  render();
  act(() => pane!.openFile(file));
  act(() => pane!.recordTouch('pane'));
  narrow();
  expect(pane).toMatchObject({ file, isAvailable: false, isCarried: true, isExpanded: true });
  expand();
  expect(pane).toMatchObject({ file, isAvailable: true, isCarried: false, isExpanded: false });
});

it('restores an expanded preview as expanded when the window widens again', () => {
  render();
  act(() => pane!.openFile(file));
  act(() => pane!.setExpanded(true));
  narrow();
  expect(pane).toMatchObject({ isCarried: true, isExpanded: true });
  expand();
  expect(pane).toMatchObject({ isCarried: false, isExpanded: true });
});

it.each(['setExpanded', 'closeFile'] as const)(
  'returns to the chat with %s and keeps the file for the wider window',
  (exit) => {
    render();
    act(() => pane!.openFile(file));
    act(() => pane!.recordTouch('pane'));
    narrow();
    act(() => (exit === 'setExpanded' ? pane!.setExpanded(false) : pane!.closeFile()));
    expect(pane).toMatchObject({ file, isCarried: false, isExpanded: false, isOpen: true });
    expand();
    expect(pane).toMatchObject({ file, isCarried: false, isExpanded: false, isOpen: true });
  },
);

it('waits for a current snapshot before deciding whether a narrow window carries the preview', () => {
  render();
  act(() => {
    pane!.openFile(file);
    pane!.recordTouch('pane');
  });
  mockIsLayoutCurrent = false;
  narrow();
  expect(pane!.isCarried).toBe(false);

  // Portrait rotation still has room for a stacked pane when its fold arrives.
  mockFold = { x: 0, y: 455, width: 669, height: 40 };
  mockIsLayoutCurrent = true;
  update();
  expect(pane!.isCarried).toBe(false);

  mockFold = null;
  update();
  expect(pane!.isCarried).toBe(true);
  mockIsLayoutCurrent = false;
  expand();
  expect(pane!.isCarried).toBe(true);
  mockIsLayoutCurrent = true;
  update();
  expect(pane).toMatchObject({ isCarried: false, isExpanded: false });
});

it.each(['chat', 'list', 'closed', 'remote'] as const)(
  'does not carry a preview when the active state is %s',
  (state) => {
    render();
    act(() => {
      pane!.openFile(file);
      pane!.recordTouch('pane');
      if (state === 'chat') pane!.recordTouch('chat');
      if (state === 'list') pane!.closeFile();
      if (state === 'closed') pane!.close();
    });
    if (state === 'remote') mockSource = 'remote';
    narrow();
    expect(pane!.isCarried).toBe(false);
  },
);

it('counts expanded reading as the active file pane', () => {
  render();
  act(() => pane!.openFile(file));
  act(() => pane!.setExpanded(true));
  narrow();
  expect(pane!.isCarried).toBe(true);
});

it('records touches without publishing another pane state', () => {
  render();
  const previous = pane;
  act(() => pane!.recordTouch('pane'));
  expect(pane).toBe(previous);
});

it.each([
  ['across the window', { height: 40, width: 669, x: 0, y: 455 }, true],
  ['down the window', { height: 669, width: 40, x: 455, y: 0 }, false],
])('stacks a pane in a compact window with a fold %s: %s', (_, fold, isAvailable) => {
  mockWindowClass = 'compact';
  mockFold = fold;
  render();
  expect(pane!.isAvailable).toBe(isAvailable);
});
