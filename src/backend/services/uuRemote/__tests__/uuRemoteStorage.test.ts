import * as SecureStore from 'expo-secure-store';

import { uuRemoteStorage, type UuRemotePending } from '../uuRemoteStorage';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test.each(['pip', 'fullscreen'] as const)(
  'preserves the selected %s mode and draft through stored JSON',
  async (mode) => {
    const pending: UuRemotePending = {
      kind: 'bind',
      mode,
      target: { page: 'chat', connectionId: 'desktop', draftId: 'unsent-draft' },
      nonce: 'binding-request',
      createdAt: 100,
    };
    await uuRemoteStorage.writePending(pending);
    const saved = jest.mocked(SecureStore.setItemAsync).mock.lastCall![1];
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(saved);

    expect(await uuRemoteStorage.readPending()).toEqual(pending);
  },
);
