import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePaneProvider, useFilePane } from '../FilePaneProvider';

let mockWindowClass = 'expanded';
let mockSource = 'local';
let mockIsLayoutCurrent = true;
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockRouter = { push: mockPush, back: mockBack };
let mockTop = { key: 'drawer', name: '(drawer)', params: {} as Record<string, string> };
const mockChatParams = { sessionId: '00000000-0000-7000-8000-000000000002' };
let mockFold: { x: number; y: number; width: number; height: number; isActive: boolean } | null =
  null;

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
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useGlobalSearchParams: () => mockChatParams,
}));
jest.mock('expo-router/react-navigation', () => ({
  useNavigationState: (select: (state: { index: number; routes: (typeof mockTop)[] }) => unknown) =>
    select({ index: 1, routes: [{ key: 'previous', name: 'onboarding', params: {} }, mockTop] }),
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
  mockWindowClass = 'expanded';
  update();
}

function showCarriedPage() {
  mockTop = {
    key: 'carried',
    name: 'files/[fileEntryId]',
    params: mockPush.mock.lastCall![0].params,
  };
  update();
}

const file = { entryId: '00000000-0000-7000-8000-000000000001' as never };

beforeEach(() => {
  mockWindowClass = 'expanded';
  mockSource = 'local';
  mockIsLayoutCurrent = true;
  mockFold = null;
  mockTop = { key: 'drawer', name: '(drawer)', params: {} };
  jest.clearAllMocks();
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

it('carries the touched preview without clearing pane state and returns only that page', () => {
  render();
  const editable = { ...file, imageEditRequestId: 'edit-request' };
  act(() => pane!.openFile(editable));
  act(() => pane!.recordTouch('pane'));
  narrow();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/files/[fileEntryId]',
    params: {
      fileEntryId: file.entryId,
      imageEditRequestId: 'edit-request',
      carriedFromPane: '1',
      sourceChat: JSON.stringify(mockChatParams),
    },
  });
  showCarriedPage();
  expect(pane).toMatchObject({ file: editable, isOpen: true, isAvailable: false });
  expand();
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(pane).toMatchObject({ file: editable, isOpen: true, isAvailable: true });
  update();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('waits for a current snapshot before deciding whether a narrow window needs a carried page', () => {
  render();
  act(() => {
    pane!.openFile(file);
    pane!.recordTouch('pane');
  });
  mockIsLayoutCurrent = false;
  narrow();
  expect(mockPush).not.toHaveBeenCalled();

  // Portrait rotation still has room for a stacked pane when its fold arrives.
  mockFold = { x: 0, y: 455, width: 669, height: 40, isActive: true };
  mockIsLayoutCurrent = true;
  update();
  expect(mockPush).not.toHaveBeenCalled();

  mockFold = null;
  update();
  expect(mockPush).toHaveBeenCalledTimes(1);
  showCarriedPage();
  mockIsLayoutCurrent = false;
  expand();
  expect(mockBack).not.toHaveBeenCalled();
  mockIsLayoutCurrent = true;
  update();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it.each(['chat', 'list', 'closed', 'remote', 'covered'] as const)(
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
    if (state === 'covered') mockTop = { key: 'settings', name: 'settings', params: {} };
    narrow();
    expand();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  },
);

it('counts expanded reading as the active file pane', () => {
  render();
  act(() => pane!.openFile(file));
  act(() => pane!.setExpanded(true));
  narrow();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('does not dismiss a different page or revive carry after the user has left it', () => {
  render();
  act(() => {
    pane!.openFile(file);
    pane!.recordTouch('pane');
  });
  narrow();
  showCarriedPage();
  const carriedPage = mockTop;
  mockTop = { key: 'settings', name: 'settings', params: {} };
  update();
  mockTop = carriedPage;
  update();
  expand();
  expect(mockBack).not.toHaveBeenCalled();
});

it('handles expanding before the carried page has finished being pushed', () => {
  render();
  act(() => {
    pane!.openFile(file);
    pane!.recordTouch('pane');
  });
  narrow();
  expand();
  expect(mockBack).not.toHaveBeenCalled();
  showCarriedPage();
  expect(mockBack).toHaveBeenCalledTimes(1);
});

it('records touches without publishing another pane state', () => {
  render();
  const previous = pane;
  act(() => pane!.recordTouch('pane'));
  expect(pane).toBe(previous);
});

it.each([
  ['across the window', { height: 0, isActive: false, width: 669, x: 0, y: 475 }, true],
  ['down the window', { height: 669, isActive: true, width: 40, x: 455, y: 0 }, false],
])('stacks a pane in a compact window with a fold %s: %s', (_, fold, isAvailable) => {
  mockWindowClass = 'compact';
  mockFold = fold;
  render();
  expect(pane!.isAvailable).toBe(isAvailable);
});
