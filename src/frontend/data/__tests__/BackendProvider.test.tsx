import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MobileBackend, TopicsBackend } from '@/shared/contracts';

import { BackendProvider, useBackendModule } from '../BackendProvider';

const topics = { get: jest.fn() } as unknown as TopicsBackend;
const backend = { topics } as MobileBackend;

function TopicModuleProbe() {
  const selected = useBackendModule('topics');
  return <Text>{selected === topics ? 'selected' : 'wrong'}</Text>;
}

describe('BackendProvider', () => {
  it('exposes only the requested module to frontend consumers', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <BackendProvider backend={backend}>
          <TopicModuleProbe />
        </BackendProvider>,
      );
    });

    expect(renderer?.root.findByType(Text).props.children).toBe('selected');
  });
});
