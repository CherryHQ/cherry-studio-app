import { useState } from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { ProviderModelPage } from '../ProviderModelPage';

const mockModel = { id: createUniqueModelId('provider', 'model'), name: 'Saved name' } as Model;
let mockIsError = false;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ providerId: 'provider', modelId: mockModel.id }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/appShell/header', () => ({ RouteHeader: () => null }));
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Error: () => null, Loading: () => null },
}));
jest.mock('@/frontend/data', () => ({
  useQuery: (path: string) => ({
    data: path.startsWith('/models') ? mockModel : { id: 'provider' },
    isError: mockIsError,
  }),
}));

function Draft({ model }: { model: Model }) {
  const [name, setName] = useState(model.name);
  return <TextInput value={name} onChangeText={setName} />;
}

function Page() {
  return <ProviderModelPage>{(model) => <Draft model={model} />}</ProviderModelPage>;
}

describe('ProviderModelPage draft lifetime', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('preserves unsaved input through a failed background refresh and recovery', () => {
    mockIsError = false;
    act(() => {
      renderer = create(<Page />);
    });
    act(() => renderer.root.findByType(TextInput).props.onChangeText('Unsaved name'));

    mockIsError = true;
    act(() => renderer.update(<Page />));
    expect(renderer.root.findByType(TextInput).props.value).toBe('Unsaved name');

    mockIsError = false;
    act(() => renderer.update(<Page />));
    expect(renderer.root.findByType(TextInput).props.value).toBe('Unsaved name');
  });
});
