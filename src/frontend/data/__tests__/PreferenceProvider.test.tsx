import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PreferenceClient } from '@/shared/data/preference';

import { PreferenceProvider, usePreferenceClient } from '../PreferenceProvider';

const preference = {} as PreferenceClient;

function Probe() {
  return <Text>{usePreferenceClient() === preference ? 'selected' : 'missing'}</Text>;
}

describe('PreferenceProvider', () => {
  test('exposes the injected preference client', async () => {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(
        <PreferenceProvider preference={preference}>
          <Probe />
        </PreferenceProvider>,
      );
    });

    expect(renderer?.root.findByType(Text).props.children).toBe('selected');
  });
});
