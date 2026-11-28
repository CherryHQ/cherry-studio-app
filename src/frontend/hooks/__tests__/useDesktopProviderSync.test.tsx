import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { useDesktopProviderSync } from '../useDesktopProviderSync';

const mockConnection: DesktopConnection = {
  alias: null,
  capabilities: ['configuration'],
  configuredEndpoints: [],
  defaultName: 'Desktop',
  id: 'desktop',
  lastFetchedAt: null,
  name: 'Desktop',
  status: 'paired',
};
const mockConnections = [mockConnection];
const mockPreview = jest.fn();
jest.mock('../useDesktopConnections', () => ({
  useDesktopConnections: () => ({ connections: mockConnections, isLoading: false }),
  useDesktopConnectionActions: () => ({ preview: mockPreview }),
}));

test('selecting the desktop after automatic catalog preparation fails retries the download', async () => {
  const failure = new DataApiError(ErrorCode.INVALID_OPERATION, 'Catalog unavailable', {
    reason: 'catalog-unavailable',
  });
  const preview = { providers: [] };
  mockPreview.mockRejectedValueOnce(failure).mockResolvedValueOnce(preview);
  let sync!: ReturnType<typeof useDesktopProviderSync>;
  function Probe() {
    sync = useDesktopProviderSync();
    return null;
  }

  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(<Probe />);
    });
    expect(mockPreview.mock.calls).toEqual([[mockConnection.id, false]]);
    expect(sync.previewError).toBe(failure);

    await act(async () => {
      await sync.loadPreview(mockConnection);
    });
    expect(mockPreview.mock.calls).toEqual([
      [mockConnection.id, false],
      [mockConnection.id, true],
    ]);
    expect(sync.loadedPreview).toEqual({ connection: mockConnection, preview });
  } finally {
    act(() => renderer?.unmount());
  }
});
