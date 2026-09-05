import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useAvatar } from '../useAvatar';

let mockAvatarPreference = 'avatar-file:first.webp';
const mockResolveAvatar = jest.fn(
  async (_avatar: string): Promise<string | undefined> => undefined,
);

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ resolveAvatar: mockResolveAvatar }),
}));

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockAvatarPreference, jest.fn()],
}));

let avatarSource: ReturnType<typeof useAvatar> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const source = useAvatar();

  useEffect(() => {
    avatarSource = source;
  }, [source]);

  return null;
}

describe('useAvatar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    avatarSource = undefined;
    mockAvatarPreference = 'avatar-file:first.webp';
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('keeps the previous avatar visible while a replacement URI resolves', async () => {
    const nextAvatar = deferred<string | undefined>();
    mockResolveAvatar.mockImplementation((avatar) => {
      if (avatar === 'avatar-file:first.webp') {
        return Promise.resolve('file:///documents/user-avatar/first.webp');
      }
      return nextAvatar.promise;
    });

    await renderHook();
    expect(avatarSource).toBe('file:///documents/user-avatar/first.webp');

    mockAvatarPreference = 'avatar-file:second.webp';
    await updateHook();

    expect(avatarSource).toBe('file:///documents/user-avatar/first.webp');

    await act(async () => {
      nextAvatar.resolve('file:///documents/user-avatar/second.webp');
      await nextAvatar.promise;
    });
    await flushQueryNotifications();

    expect(avatarSource).toBe('file:///documents/user-avatar/second.webp');
  });
});

async function renderHook() {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  await flushQueryNotifications();
}

async function updateHook() {
  await act(async () => {
    renderer?.update(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
}

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
