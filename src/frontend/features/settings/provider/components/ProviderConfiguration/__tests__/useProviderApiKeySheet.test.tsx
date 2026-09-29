import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { useProviderApiKeySheet } from '../hooks/useProviderApiKeySheet';

jest.mock('expo-crypto', () => {
  let id = 0;
  return { randomUUID: () => `generated-${++id}` };
});

describe('provider API key sheet', () => {
  const actions = {
    addApiKey: jest.fn(async () => true),
    removeApiKey: jest.fn(async () => true),
    updateApiKey: jest.fn(async () => true),
  };
  const existing: ApiKeyEntry[] = [
    { id: 'a', isEnabled: false, key: 'sk-existing', label: 'Work' },
  ];
  let renderer: ReactTestRenderer;
  let sheet: ReturnType<typeof useProviderApiKeySheet>;
  function Probe() {
    sheet = useProviderApiKeySheet(existing, actions);
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('adds nothing when a new key is cancelled', () => {
    act(() => sheet.startAdd());
    act(() => sheet.change({ key: 'sk-new' }));
    act(() => sheet.close());
    expect(actions.addApiKey).not.toHaveBeenCalled();
    expect(sheet.state?.open).toBe(false);
  });

  it('keeps edits local until the user saves, then writes them once', () => {
    act(() => sheet.startEdit(existing[0]));
    act(() => sheet.change({ label: 'Pers' }));
    act(() => sheet.change({ label: ' Personal ' }));
    expect(actions.updateApiKey).not.toHaveBeenCalled();

    act(() => sheet.submit());
    expect(actions.updateApiKey).toHaveBeenCalledTimes(1);
    expect(actions.updateApiKey).toHaveBeenCalledWith('a', {
      key: 'sk-existing',
      label: 'Personal',
    });
  });

  it('adds a valid new key once and rejects empty or duplicate keys', () => {
    act(() => sheet.startAdd());
    expect(sheet.error).toBe('empty');
    act(() => sheet.change({ key: 'sk-existing' }));
    expect(sheet.error).toBe('duplicate');
    act(() => sheet.submit());
    expect(actions.addApiKey).not.toHaveBeenCalled();

    act(() => sheet.change({ key: ' sk-new ' }));
    act(() => sheet.submit());
    act(() => sheet.submit());
    expect(actions.addApiKey).toHaveBeenCalledTimes(1);
    expect(actions.addApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true, key: 'sk-new' }),
    );
  });

  it('removes only an existing key', () => {
    act(() => sheet.startAdd());
    act(() => sheet.remove());
    expect(actions.removeApiKey).not.toHaveBeenCalled();

    act(() => sheet.startEdit(existing[0]));
    act(() => sheet.remove());
    expect(actions.removeApiKey).toHaveBeenCalledWith('a');
  });
});
