import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { AppUpdateDialog, type AppUpdateOrigin } from '../AppUpdateDialog';

const mockIdle = { status: 'idle' } as const;
const mockUpdate = {
  getDownload: () => mockIdle,
  subscribeDownload: () => () => {},
  releaseNotes: jest.fn(async () => 'Cold-start-only notes'),
};
jest.mock('@/frontend/data/BackendProvider', () => ({ useBackendModule: () => mockUpdate }));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => [0] }));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('@cherrystudio/ui/utils', () => ({ normalizeFontSizeStep: () => 0 }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-us' } }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  Button: ({ children }: { children: ReactNode }) => children,
  Spinner: () => null,
}));
const release: AppUpdateRelease = {
  channel: 'domestic-stores',
  store: 'honor',
  id: 'honor:20',
  currentVersion: '1.0.0',
  latestVersion: '2.0.0',
  notesSource: 'store',
  notes: 'Cold-start-only notes',
};
const actions = {
  cancel: jest.fn(),
  close: jest.fn(),
  install: jest.fn(),
  retry: jest.fn(),
  start: jest.fn(),
};
let client: QueryClient;
let renderer: ReactTestRenderer;
const tree = (origin: AppUpdateOrigin | null) => (
  <QueryClientProvider client={client}>
    <AppUpdateDialog actions={actions} origin={origin} release={origin ? release : null} />
  </QueryClientProvider>
);
const rendered = () => JSON.stringify(renderer.toJSON());
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  act(() => renderer.unmount());
  client.clear();
});

test('manual presentation neither requests nor displays release notes', async () => {
  await act(async () => {
    renderer = create(tree('manual'));
  });
  expect(mockUpdate.releaseNotes).not.toHaveBeenCalled();
  expect(rendered()).not.toContain('Cold-start-only notes');
  expect(rendered()).toContain('appUpdate.currentVersion');
  expect(rendered()).toContain('appUpdate.openStore');
});

test('cached cold-start notes do not leak into a later manual presentation', async () => {
  await act(async () => {
    renderer = create(tree('coldStart'));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledTimes(1);
  expect(rendered()).toContain('Cold-start-only notes');
  act(() => renderer.update(tree(null)));
  act(() => renderer.update(tree('manual')));
  expect(mockUpdate.releaseNotes).toHaveBeenCalledTimes(1);
  expect(rendered()).not.toContain('Cold-start-only notes');
});
