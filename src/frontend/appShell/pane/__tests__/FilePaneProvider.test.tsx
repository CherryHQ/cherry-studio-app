import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePaneProvider, useFilePane } from '../FilePaneProvider';

let mockWindowClass = 'expanded';
let mockSource = 'local';

jest.mock('@/frontend/appShell/layout', () => ({ useWindowClass: () => mockWindowClass }));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
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

const file = { entryId: '00000000-0000-7000-8000-000000000001' as never };

beforeEach(() => {
  mockWindowClass = 'expanded';
  mockSource = 'local';
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
