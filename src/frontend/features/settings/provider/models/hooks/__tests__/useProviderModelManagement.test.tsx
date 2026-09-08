import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createUniqueModelId, type Model, type UniqueModelId } from '@/shared/data/types/model';

import { useProviderModelManagement } from '../useProviderModelManagement';

const model = {
  id: createUniqueModelId('provider', 'model'),
  providerId: 'provider',
  modelId: 'model',
  name: 'Model',
} as Model;
const models = [model];
const mockDelete = jest.fn();
const mockConfirm = jest.fn();
const mockToast = jest.fn();
const mockPush = jest.fn();
const mockNavigation = { addListener: jest.fn(() => () => undefined) };
const mockQueryClient = {};
let mockDefaultModelId: UniqueModelId | null = null;

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockConfirm } }),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => mockNavigation,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => ({ useMutation: () => ({ trigger: mockDelete }) }));
jest.mock('@/frontend/components/ModelPicker', () => ({
  MODEL_SETTING_KINDS: ['default', 'fast', 'translate', 'painting'],
  MODEL_SETTING_KIND_TITLE_KEYS: { default: 'Default' },
  useModelSettingSelections: () => ({
    selections: { default: mockDefaultModelId, fast: null, translate: null, painting: null },
  }),
}));
jest.mock('../../utils/refreshProviderModelQueries', () => ({
  refreshProviderModelQueries: async () => undefined,
}));

describe('model management deletion', () => {
  let renderer: ReactTestRenderer;
  let management: ReturnType<typeof useProviderModelManagement>;
  function Probe() {
    management = useProviderModelManagement('provider', models, models);
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockDefaultModelId = null;
    mockDelete.mockResolvedValue(undefined);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
  });

  it('selects the originating model and retains it after a failed confirmed delete', async () => {
    mockDelete.mockRejectedValue(new Error('write failed'));
    act(() => management.beginSelection(model));
    expect(management.selectedIds.has(model.id)).toBe(true);
    act(() => management.requestDelete());
    expect(mockDelete).not.toHaveBeenCalled();
    await act(async () => {
      mockConfirm.mock.calls[0][0].onConfirm();
    });
    expect(management.isSelecting).toBe(true);
    expect(management.selectedIds.has(model.id)).toBe(true);
    expect(management.isDeleting).toBe(false);
  });

  it('leaves selection mode only after the confirmed delete succeeds', async () => {
    act(() => management.beginSelection(model));
    act(() => management.requestDelete());
    await act(async () => {
      mockConfirm.mock.calls[0][0].onConfirm();
    });
    expect(mockDelete).toHaveBeenCalledWith({ query: { ids: [model.id] } });
    expect(management.isSelecting).toBe(false);
    expect(management.selectedIds.size).toBe(0);
  });

  it('routes default-model conflicts to settings without attempting deletion', () => {
    mockDefaultModelId = model.id;
    act(() => management.beginSelection(model));
    act(() => management.requestDelete());
    expect(mockConfirm.mock.calls[0][0].title).toBe(
      'settings.provider.models.management.protectedTitle',
    );
    act(() => mockConfirm.mock.calls[0][0].onConfirm());
    expect(mockPush).toHaveBeenCalledWith('/settings/model');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(management.selectedIds.has(model.id)).toBe(true);
  });
});
