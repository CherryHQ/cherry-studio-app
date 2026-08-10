import { act, create } from 'react-test-renderer';

const mockGetBalance = jest.fn(async () => ({ balance: 42 }));
const mockUseProviderOauth = jest.fn((_providerId: string) => ({
  status: { isAuthenticated: true },
}));

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ getBalance: mockGetBalance }),
}));
jest.mock('../useProviderOauth', () => ({
  __esModule: true,
  useProviderOauth: (providerId: string) => mockUseProviderOauth(providerId),
}));

import { useCherryInOauth } from '../useCherryInOauth';

it('adds CherryIN balance to the generic provider OAuth controller', async () => {
  let latest: ReturnType<typeof useCherryInOauth> | undefined;

  function Probe() {
    latest = useCherryInOauth('cherryin');
    return null;
  }

  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Probe />);
  });

  expect(mockUseProviderOauth).toHaveBeenCalledWith('cherryin');
  expect(mockGetBalance).toHaveBeenCalledWith();
  expect(latest?.balance).toBe(42);
  act(() => renderer.unmount());
});
