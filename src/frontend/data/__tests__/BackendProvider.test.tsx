import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Backend, ProfileBackend } from '@/shared/contracts';

import { BackendProvider, useBackendModule } from '../BackendProvider';

const profile = { resolveAvatar: jest.fn() } as unknown as ProfileBackend;
const backend = { profile } as unknown as Backend;

function ProfileModuleProbe() {
  const selected = useBackendModule('profile');
  return <Text>{selected === profile ? 'selected' : 'wrong'}</Text>;
}

describe('BackendProvider', () => {
  it('exposes only the requested module to frontend consumers', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <ProfileModuleProbe />
        </BackendProvider>,
      );
    });

    expect(renderer?.root.findByType(Text).props.children).toBe('selected');
  });
});
