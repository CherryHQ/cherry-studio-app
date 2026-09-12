import { act, create } from 'react-test-renderer';

import { getWebSearchProviderPreset } from '../../../utils/providerSettings';
import { useWebSearchProviderCheck } from '../useWebSearchProviderCheck';

const mockCheckProvider = jest.fn(
  async (): Promise<{ error?: string; valid: boolean }> => ({ valid: true }),
);
const mockAlertShow = jest.fn();
const mockToastShow = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ checkProvider: mockCheckProvider }),
}));

describe('useWebSearchProviderCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckProvider.mockResolvedValue({ valid: true });
  });

  test('checks the supplied key and reports success', async () => {
    let startCheck: ((apiKey: string) => Promise<void>) | undefined;

    function Harness() {
      ({ startCheck } = useWebSearchProviderCheck(
        getWebSearchProviderPreset('exa'),
        { apiKeys: ['stored-key'] },
        'searchKeywords',
      ));
      return null;
    }

    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness />);
    });
    await act(async () => startCheck?.('first-key'));

    expect(mockCheckProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({ apiKeys: ['first-key'], id: 'exa' }),
      }),
    );
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.websearch.provider.checkSuccess',
      variant: 'success',
    });
    act(() => renderer!.unmount());
  });
});
