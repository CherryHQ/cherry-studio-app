import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useProviderApiServiceQueries } from '../useProviderApiServiceQueries';

const mockQueryClient = {};
const mockMutationTrigger = jest.fn();
const mockUseMutation = jest.fn((_method: unknown, _path: unknown, _options?: unknown) => ({
  isLoading: false,
  trigger: mockMutationTrigger,
}));
const mockUseQuery = jest.fn((_path: unknown, _options?: unknown) => ({ data: undefined }));
const mockRestoreQuerySnapshot = jest.fn((_queryClient: unknown, _snapshot: unknown) => undefined);
const mockUpdateQueriesOptimistically = jest.fn(
  async (_queryClient: unknown, _filters: unknown, _update: unknown) => [],
);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/frontend/data', () => ({
  useMutation: (method: unknown, path: unknown, options?: unknown) =>
    mockUseMutation(method, path, options),
  useQuery: (path: unknown, options?: unknown) => mockUseQuery(path, options),
}));

jest.mock('@/frontend/data/utils/optimisticQueryUpdate', () => ({
  restoreQuerySnapshot: (queryClient: unknown, snapshot: unknown) =>
    mockRestoreQuerySnapshot(queryClient, snapshot),
  updateQueriesOptimistically: (queryClient: unknown, filters: unknown, update: unknown) =>
    mockUpdateQueriesOptimistically(queryClient, filters, update),
}));

type MutationOptions = {
  onMutate?: (variables: {
    body: { id: string; isEnabled: boolean; key: string }[];
    params: { id: string };
  }) => Promise<unknown>;
  refresh?: (context: { args: { params: { id: string } } }) => readonly string[];
};

function Probe() {
  useProviderApiServiceQueries('provider-from-render');
  return null;
}

describe('useProviderApiServiceQueries', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMutation.mockImplementation(() => ({
      isLoading: false,
      trigger: mockMutationTrigger,
    }));
    mockUseQuery.mockImplementation(() => ({ data: undefined }));
    mockUpdateQueriesOptimistically.mockResolvedValue([]);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('scopes optimistic API-key updates to the mutation variables', async () => {
    await act(async () => {
      renderer = create(<Probe />);
    });

    const replaceMutationCall = mockUseMutation.mock.calls.find(([method]) => method === 'PUT');
    const options = replaceMutationCall?.[2] as MutationOptions | undefined;
    const variables = {
      body: [{ id: 'key-1', isEnabled: true, key: 'sk-test' }],
      params: { id: 'provider-from-mutation' },
    };

    await options?.onMutate?.(variables);

    expect(mockUpdateQueriesOptimistically).toHaveBeenCalledWith(
      mockQueryClient,
      {
        exact: true,
        queryKey: ['/providers/provider-from-mutation/api-keys'],
      },
      expect.any(Function),
    );
    expect(options?.refresh?.({ args: variables })).toEqual([
      '/providers',
      '/providers/page',
      '/providers/provider-from-mutation',
      '/providers/provider-from-mutation/api-keys',
    ]);
  });
});
